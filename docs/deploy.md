# Deploying

Four Google Cloud projects: `platform-id-shared` owns DNS, and
`platform-id-dev-502710`, `platform-id-test`, `platform-id-prod` own one stack
each.

## Terraform layout

```
infra/modules/
  network          VPC + private services access, so Cloud SQL needs no public IP
  cloud-sql        one instance, a database and user per service, DSN per service
  cloud-run        one service; env vars, secret env vars, secret files, invokers
  cloud-run-job    migrations and the bootstrap job
  load-balancer    external HTTPS LB, one managed certificate per hostname
infra/environments/
  shared           the id.os.build zone and the A records for all three envs
  dev test prod    one stack each
```

The three environment stacks are deliberately near-identical. The whole diff is
the backend bucket, the project, the environment label, prod sitting at the zone
apex, prod's database tier and regional availability, and the courier sender.
When something needs to change in all three, change dev and copy the file; that
is how they were built, and it is why they have not drifted.

## First apply of a new environment

Order matters, and getting it wrong produces errors that look like something
else.

**Two prerequisites before any of it**, neither of which terraform can do for
itself, and both of which dev satisfies by accident of how it was built rather
than because anything recorded them.

```
gcloud services enable cloudresourcemanager.googleapis.com --project <project>
```

`google_project_service` needs that API to manage project services at all, so it
cannot appear in `apis.tf`. Without it, every project-level read fails at once
and the plan never completes.

The second is Binary Authorization, which is the one API here that requires a
quota project on user credentials. The provider ignores the ADC quota project, so
a local apply needs the override, and setting it is what makes the first
prerequisite mandatory: with it, every call bills to the environment's own
project rather than to gcloud's shared one.

```
export USER_PROJECT_OVERRIDE=true GOOGLE_BILLING_PROJECT=<project>
```

Then:

1. **Secrets first.** `secrets.tf` creates the containers; the values are added
   out of band. Cloud Run refuses to start a service whose secret has no enabled
   version, and the failure reads like a broken image.
   ```
   printf '%s' "$VALUE" | gcloud secrets versions add <id> --project <p> --data-file=-
   ```
2. **Apply, as an owner and from a workstation.** Not `infra.yml`: the first apply
   creates the KMS key ring, the Binary Authorization policy, the project IAM
   bindings and the audit bucket, and `terraform@` is deliberately unable to
   create any of them (see [The terraform identity](#the-terraform-identity)). It
   also cannot delete a service account, so a runtime identity dropped from
   `local.runtimes` since the last apply goes the same way. Every later apply is
   `infra.yml`, and that identity's project roles want granting before the first
   deploy, because the deploy workflow plans with them.

   This creates the network, database, services and load balancer. The services
   will not be healthy yet.
3. **Publish DNS before the certificates finish.** Google validates a managed
   certificate against the record; created too early it sticks at
   `FAILED_NOT_VISIBLE`, and it cannot be replaced in place because the module
   uses a fixed name with `create_before_destroy`. Recovering means detaching it
   from the proxy, deleting it, and applying again.
4. **Build and push the images before the apply above, not after.** Cloud Run
   validates a job's image when the job is created, and `migrations.tf` and
   `bootstrap.tf` name `:<env>`, so on a new environment the apply fails with
   "Image ... not found" for each job while everything else succeeds. The
   services do not have this problem: the `cloud-run` module creates them on
   Google's placeholder image. `gh workflow run build-images.yml -f
   environment=<env>` is enough, and it needs the KMS key and the attestor, which
   the same apply creates, so in practice a first apply runs twice: once to build
   the estate, then the images, then again for the jobs.
5. **Run the migration jobs**, then **deploy**. An unmigrated database answers
   "Unable to locate the table", which also looks like a broken image.
   ```
   gcloud run jobs execute migrate-kratos-<env> --project <p> --region europe-west3 --wait
   ```
6. **Run the bootstrap job** to grant the first operator console access.

## Images

Every Ory service is its upstream image with our config baked on by a per-service
Dockerfile, so a config change becomes an image with a git sha and per-environment
difference stays in environment variables. Both Next apps have their own
Dockerfile: standalone output, non-root, and the GitHub Packages token as a build
secret so it never lands in a layer.

```
R=europe-west3-docker.pkg.dev/<project>/id
docker build --platform linux/amd64 --secret id=npmrc_auth,src=$HOME/.npmrc \
  -f apps/console/Dockerfile -t $R/console:<env> .
docker push $R/console:<env>
gcloud run services update console-<env> --project <p> --region europe-west3 \
  --image $R/console:<env>
```

The `cloud-run` module ignores changes to the image tag, so terraform and a
deployment do not fight over it.

## Scaling

Every service pins `min_instances = 1` in all three environments. Ory's services
each hold a database connection pool and Hydra's discovery document is on the
critical path of every sign-in, so a scale-to-zero issuer turns an ordinary
authorization into a cold start the browser waits on. The courier is pinned at
exactly one for a different reason (see [Mail](#mail)): more than one process
watching the queue sends a message twice.

## Certificates and hostnames

One managed certificate per hostname, not one with several SANs. A multi-SAN
certificate is shared fate: adding a host rewrites the SAN list, rotates that one
certificate and drops HTTPS for every host on the proxy for 15 to 30 minutes.
Per-host certificates make adding a hostname additive.

Removing a hostname is still awkward: it needs manual URL-map surgery, and the
certificate cannot be replaced in place.

## Mail

Kratos renders and sends its own mail; there is no mailer service in the path.
The courier runs in the Kratos process via `--watch-courier`, which is documented
as a single-instance arrangement, so the Kratos service pins `min_instances = 1`.
Without the flag Kratos queues into `courier_messages`, logs "Sending out …
email", and nothing ever leaves.

The sender must be on a domain the provider has verified. It is an explicit
`mail_from_address` variable rather than being derived from the hostname, because
the failure lands after queueing and the UI has already said a code was sent.

## Continuous deployment

`.github/workflows/deploy.yml` runs the deployment half of the sequence above for
one environment: build, push and sign every image, check that the environment's
infrastructure matches the commit, then the migration jobs, then the services.
They are separate jobs chained with `needs`, so the order is a property of the
workflow rather than a note in this file. Signing belongs to the build job
because the attestation has to exist before anything tries to start the digest;
see [Binary Authorization](#binary-authorization).

The `infra` job plans and never applies: this workflow ships code, and giving it
the power to change infrastructure would put the estate on the same trigger as a
typo in a component. `terraform plan -detailed-exitcode` answers 0 for up to
date and 2 for a diff, and a diff fails the deploy with the dispatch command to
apply it. What that catches is code arriving without its configuration, which is
how `/account` shipped while Kratos kept redirecting to `/settings` for days: the
apply carrying the new URL had been failing on a permission, and nothing
connected the two.

A push to `main` deploys `dev`. A release tag deploys `test` or `prod`:
`vX.Y.Z-beta.N` for test, `vX.Y.Z` for prod, which is the same contract the
platform estate has, so the two halves a reviewer meets on test are both a named
version rather than one version and one branch tip. A dispatch can re-run either
from that tag, and is refused from a branch, because the environment's branch
policy has to admit `main` for `sync-secrets.yml` and `infra.yml` and therefore
cannot tell a deploy from a secret sync.

Which refs may impersonate the two identities at all is a separate gate and sits
on the provider: `refs/heads/main` or a `refs/tags/v` prefix. A tag cannot be
written as a principalSet member, which is an exact value, so the ref moved from
the bindings onto `attribute_condition`, where a pull request ref is now refused
at the token exchange rather than admitted and then rejected. Tags therefore
carry deploy authority, and the `protect-release-tags` ruleset is what bounds it:
`refs/tags/v*` cannot be created, moved, force-moved or deleted except by an
organization or repository admin. A release tag is immutable, so the commit a
reviewer approved on test is the commit prod takes.

Authentication is Workload Identity Federation, so no key exists to leak. There
are two identities and one provider, and the split is what bounds a compromised
workflow: `deploy@` pushes an image, runs a job and points a service at a new
image, and can do nothing else, while `terraform@` applies the stacks. Secret
versions and DNS stay manual.

| Variable | Value |
| --- | --- |
| `WIF_PROVIDER` | `terraform output wif_provider` |
| `WIF_SERVICE_ACCOUNT` | `deploy@<project>.iam.gserviceaccount.com` |
| `WIF_TERRAFORM_SERVICE_ACCOUNT` | `terraform@<project>.iam.gserviceaccount.com` |
| `GCP_PROJECT` | that environment's project id |
| `GCP_REGION` | `europe-west3` |

Plus the secrets `sync-secrets.yml` pushes into Secret Manager, one per value
that comes from outside: the SMTP connection URI, Kratos's cookie and cipher
secrets, Hydra's system secret and pairwise salt,
`IDENTITY_WEBHOOK_SECRET`, which the platform API checks on the identity
webhooks and which both ends mount the same value of, and
`AUDIT_WEBHOOK_SECRET`, which authenticates both internal audit receivers — one
value, because each grants the same thing, permission to write an audit row.

The two Next apps' own OAuth2 clients are the same pattern split in half: the
ids are the `ID_CLIENT_ID` and `ID_CONSOLE_CLIENT_ID` variables, carried into
terraform, and the secrets are `ID_CLIENT_SECRET` and `ID_CONSOLE_CLIENT_SECRET`,
synced. Both are optional: an environment with no client registered leaves the
variable unset, nothing is mounted, and the tenancy pages say so. Register each
client in that environment's console under Applications, confidential, consent
skipped, audienced at the platform API, with `<app host>/auth/callback` as the
redirect URI and `<app host>/tenancy` as the post-logout redirect URI. Hydra
refuses a logout whose landing page is not whitelisted, and `/auth/logout` on
either app lands there. The local seed scripts (`apps/*/scripts/seed-platform-client.ts`)
register the same shape against a local Hydra.

The variable goes last. The containers are created unconditionally and the
mount is conditional on the id, so an apply with the id unset creates the
containers, a dispatch of `sync-secrets.yml` fills them, and only then does
setting `ID_CLIENT_ID` and applying again mount the pair. With the id set before
the containers hold a version, the apply mounts a secret Cloud Run cannot
resolve and the service update fails with `versions/latest was not found`.

A secret declared in `secrets.tf` but missing from `sync-secrets.yml` gets a
container and never a version, and Cloud Run will not start a service that
mounts one — so the service update fails with `Secret ... was not found` long
after the change that caused it. Adding a value is both places or neither.

### The terraform identity

Created out of band, and deliberately not by terraform: an identity terraform
manages is an identity terraform can widen, which is the escalation the split
exists to prevent. Per environment:

```
gcloud iam service-accounts create terraform --project=<project>
gcloud iam service-accounts add-iam-policy-binding terraform@<project>.iam.gserviceaccount.com \
  --project=<project> \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/github/attribute.repository/<org>/<repo>"
```

The member is the repository rather than a ref: `deploy.yml`'s plan job runs as
this identity on whatever ref the deploy came from, which is a tag for test and
prod. The refs are bounded by the provider's `attribute_condition` instead.

`--project` on the second command is not redundant: the account email names the
project but gcloud resolves the account against `core/project`, so without it the
binding fails with NOT_FOUND against whichever project is configured.

then, project-wide: `run.admin`, `compute.admin`, `cloudsql.admin`, `dns.admin`,
`artifactregistry.admin`, `monitoring.editor`, `logging.configWriter`,
`servicenetworking.networksAdmin` as write, and `iam.securityReviewer`,
`cloudkms.viewer`, `binaryauthorization.policyViewer`,
`containeranalysis.notes.viewer`, `serviceusage.serviceUsageViewer`,
`storage.bucketViewer` as read. Plus `storage.objectAdmin` on that environment's
state bucket alone, and `iam.serviceAccountUser` on each `run-*-<env>` account,
which Cloud Run requires to deploy a service that runs as one.

Secrets are the exception worth understanding. `roles/secretmanager.admin`
carries `secretmanager.versions.access`, which is read-the-value, and in this
project that includes every DSN: whoever holds it
can mint a token asserting any subject and any `staffRole`. So the
identity gets a project custom role instead, `terraformSecretManager`, which is
that role minus `versions.access`, and `secretAccessor` on only the secrets whose
versions terraform manages. It can create, delete and set IAM on every secret and
read almost none.

What it cannot do is the point: grant IAM, create a role, touch KMS or the
Binary Authorization policy, or reach the audit-log bucket. Those resources are
in these stacks and stay readable, so an apply that leaves them alone succeeds
and an apply that changes one fails loudly with a 403 naming it, at which point a
person applies that change.

Images carry two tags. The git sha is what the services are pinned to, so a
rollback is a dispatch at an older sha. The environment name is what the
migration and bootstrap jobs resolve when they run, and that moving tag is
load-bearing: the deploy identity may run a job but not update one, so a job
picks up new code only because its tag moved.

## Binary Authorization

The narrow deploy identity still leaves one short path: anyone who can write to
the Artifact Registry repository can push an image, and "point a service at a new
image" is the one thing the identity is for. Binary Authorization closes that by
requiring every digest to carry a signature made by a KMS key only the deploy
account can use, so pushing an image is no longer enough to run it.

`infra/environments/*/binauthz.tf` holds the key ring, the asymmetric signing
key, the Artifact Analysis note the signatures land in, the attestor, and the
policy. The policy has one rule, `defaultAdmissionRule`, at
`REQUIRE_ATTESTATION`. The workflow's build job signs each digest right after it
pushes, before anything migrates or deploys.

The deploy account gains four grants and no more: `roles/cloudkms.signer` and
`roles/cloudkms.publicKeyViewer` on the key (sign, and read the algorithm before
signing — not `signerVerifier`, since verifying is the policy's job),
`roles/containeranalysis.notes.attacher` on the note, and
`roles/containeranalysis.occurrences.editor` on the project because an occurrence
has no resource to scope a grant to before it exists. A fifth,
`roles/binaryauthorization.attestorsVerifier` on the attestor, exists only so the
signing step can pass `--validate` and fail the build on a key mismatch instead of
letting it surface as a refused revision days later.

### Two switches, and the order matters

Enforcement is off by default and it takes two independent changes to arrive at a
policy that actually blocks:

1. `var.binauthz_enforcement_mode`, which starts at `DRYRUN_AUDIT_LOG_ONLY`:
   Binary Authorization records its verdict and admits the image anyway.
2. `binary_authorization { use_default = true }` on each Cloud Run service and
   job. Cloud Run consults the policy only for a resource that opted in, so until
   this is set in `infra/modules/cloud-run{,-job}` the policy governs nothing.

Do them in that order, and put a deployment between them:

```
terraform apply                       # policy exists, dry-run, nothing enforced
# push to main; the build job signs every image
gcloud logging read --order=desc --freshness=1d --project <p> \
  'resource.type="cloud_run_revision" AND logName:"cloudaudit.googleapis.com%2Fsystem_event" AND "dry run"'
```

That query is the whole point of dry-run. Every image has to appear as a pass,
including the moving `:<env>` tags the migration and bootstrap jobs resolve,
before either switch moves. Only then set `use_default`, deploy again, and last
of all set `binauthz_enforcement_mode = "ENFORCED_BLOCK_AND_AUDIT_LOG"`. Do it in
`dev` first and leave it there for a few deployments; `test` and `prod` are
copies of the same file and inherit whatever dev has proven.

One exemption is in the policy and has to stay: `infra/modules/cloud-run` creates
every service on Google's placeholder image, because a service must exist before
the workflow has anywhere to push to. `us-docker.pkg.dev/cloudrun/container/*` is
allowlisted for that. Everything else is ours — the three Ory images add our config
to an `oryd/*` base, bootstrap adds a script to alpine, both Next apps are built
here — and the jobs run those same images, so nothing else needs an entry. There
is no Cloud SQL proxy sidecar to allow: the database connection is a Cloud Run
volume, not a container.

### If enforcement is on and deployments are blocked

A blocked revision is not a failed process. Cloud Run keeps serving the previous
revision, so nothing is down, but the service cannot be updated — and a rollback
is also a new revision, so the usual escape does not work. The surface error says
the revision uses an unauthorized container image and names it, which reads like a
registry or permissions problem.

Confirm it is Binary Authorization:

```
gcloud logging read --order=desc --freshness=1d --project <p> \
  'resource.type="cloud_run_revision" AND logName:"cloudaudit.googleapis.com%2Fsystem_event" AND protoPayload.response.status.conditions.reason="ContainerImageUnauthorized"'
```

`ContainerImageUnauthorized` is the reason code; it appears nowhere else. The
entry names the digest that was evaluated, which is what to compare against the
digest the build job attested.

Then, in order of how little they break:

1. **One deployment through.** Add `--breakglass-justification="<reason>"` to the
   `gcloud run services update` for that service. The justification is written to
   the audit log, and the next update clears it.
2. **One service off the gate.** `gcloud run services update <service>-<env>
   --region <r> --clear-binary-authorization`. Terraform will want to put it back
   on the next apply, which is the correct outcome.
3. **The whole policy back to dry-run.** Set `binauthz_enforcement_mode` to
   `DRYRUN_AUDIT_LOG_ONLY` and apply. Slowest, and the only one that needs
   terraform.

None of these requires the attestation to be fixed first, which is the property
worth having: the way out never depends on the thing that broke.

### Left to do

The deploy identity holds `run.services.update`, and the Binary Authorization
opt-in is a field on the service, so the identity that the policy constrains can
also turn the policy off for a service. Closing that is an organization policy,
`constraints/run.allowedBinaryAuthorizationPolicies` with the single allowed value
`default`, applied at the project. It needs `roles/orgpolicy.policyAdmin` and it
must go on *after* `use_default` is set everywhere: with it in place, updating a
service that has Binary Authorization disabled is itself a policy violation, so
setting it too early blocks exactly the deployments that would fix it.

## Releasing the packages

`packages/sdk` and `packages/client-nextjs` publish to GitHub Packages; `packages/contracts`
is private and never leaves the workspace.

Adding a change:

```
pnpm changeset          # pick the packages and the bump, write the summary
```

That writes a file under `.changeset/`, which is reviewed with the code. On
merge to main the release workflow opens or updates a "Version Packages" pull
request that applies every pending changeset to versions and CHANGELOGs.
Merging that pull request is what publishes, because the workflow only runs the
publish path once no pending changesets remain.

Nothing is built on the versioning push: `changeset version` only rewrites
package.json and CHANGELOGs. The publish path builds the two publishable
packages immediately beforehand, so a release cannot ship stale output.

## What is not automated

Terraform, every secret value, and the bootstrap job. Of the two orderings that
matter, only build → migrate → deploy is encoded; DNS before certificates is
terraform's and stays a human ordering.
