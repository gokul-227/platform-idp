# Operations

## Reaching an admin API

Kratos and Hydra admin authenticate nobody, so two things stand in front of them
and a caller needs both: the service takes internal ingress only, and it grants
`run.invoker` to named service accounts. In normal operation the only callers are
the console, `apps/id` for the consent challenge, and the bootstrap job, each
reaching the `*.run.app` address over the VPC.

From a laptop there is no path in, by design: `gcloud run services proxy`
connects from outside the VPC and is refused. Break-glass is to open the door,
use it, and close it:

```
gcloud run services update kratos-admin-dev --project <p> --region europe-west3 --ingress=all
gcloud run services proxy kratos-admin-dev --project <p> --region europe-west3 --port 8081
curl -s "http://localhost:8081/admin/identities?page_size=50"
gcloud run services update kratos-admin-dev --project <p> --region europe-west3 --ingress=internal
```

Both updates are Admin Activity audit entries, so the window is on the record
rather than standing open. While it is open, `run.invoker` on that service is the
whole control, and it is full control over every identity including the root
operator the console refuses to touch: treat that binding as the most privileged
grant in the project. A `terraform apply` also restores the ingress, so a window
left open closes at the next one.

## Bootstrapping the first operator

`ory/bootstrap` runs as a Cloud Run job. It grants console access to
`bootstrap_staff_email`, matching on email and schema together so it is
idempotent, and refuses loudly rather than guessing if the address is in an
unexpected state.

It cannot enrol a second factor: Kratos has no admin API for TOTP. So the first
operator must add an authenticator app before the console will let them in.
Until then the console hands their session to the step-up flow, and the sign-in
app offers enrolment there.

## Granting console access

In the console, on the identity's detail page. See [identities.md](identities.md)
for the rules. Directly, when no console is reachable yet:

```
ID=$(curl -s "http://localhost:8081/admin/identities?credentials_identifier=someone@example.com" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -X PATCH "http://localhost:8081/admin/identities/$ID" \
  -H "Content-Type: application/json" \
  -d '[{"op":"replace","path":"/schema_id","value":"staff"},
       {"op":"replace","path":"/metadata_public","value":{"staffRole":"superadmin"}}]'
```

Revoking is the same with `default` and `{}`. The identity keeps its id,
credentials and sessions either way.

## Reading the courier queue

Kratos records every message it renders, which is the fastest way to see whether
mail was queued, sent or is stuck:

```
select status, count(*) from courier_messages group by status;
select subject, created_at from courier_messages order by created_at desc limit 5;
```

The subject carries the code for code-based flows.

## Rotating secrets

Add a new version; Cloud Run reads `latest` and picks it up on the next revision.

```
printf '%s' "$NEW" | gcloud secrets versions add <id> --project <p> --data-file=-
gcloud run services update <service> --project <p> --region europe-west3 --no-traffic --tag rotate
```

Never destroy the old version as part of a rotation. A destroyed version makes
`latest` unreadable, every consumer fails to start, and there is nothing to roll
back to; that is why the module sets `deletion_policy = "DISABLE"`.

Secrets with an expiry that will bite: the Entra client secret (Microsoft rejects
every sign-in the moment it lapses) and the SMTP credential.

## Cloud Armor

One policy per environment, `id-<env>-armor`, attached to all five public
backends and to the JWKS path route. The default rule is allow; every rule that
denies matches a specific path. Definitions and the reasoning behind each
threshold are in `infra/modules/load-balancer/armor.tf`, and the knobs are
`infra/environments/<env>/armor.tf`.

| Rule | Matches | Allowance per IP | Ban |
| --- | --- | --- | --- |
| `1000` scanners | everything except `/self-service/*`, `scannerdetection-v33-stable` at sensitivity 1 | n/a, 403 on match | n/a |
| `1100` login | `/self-service/login*` except `/flows` | 60 / 60s | 300 / 300s for 10 min |
| `1110` registration | `/self-service/registration*` except `/flows` | 20 / 60s | 100 / 300s for 30 min |
| `1120` recovery | `/self-service/recovery*` except `/flows` | 10 / 60s | 40 / 600s for 30 min |
| `1130` OIDC callback | `/self-service/methods/*/callback*` | 30 / 60s | 150 / 300s for 10 min |
| `1140` verification | `/self-service/verification*` except `/flows` | 10 / 60s | 40 / 600s for 30 min |
| `1150` settings | `/self-service/settings*` except `/flows` | 30 / 60s | 150 / 300s for 15 min |
| `1200` token | `/oauth2/token` | 300 / 60s | 3000 / 300s for 5 min |

Over the allowance is `429` from the load balancer, not from Ory. Adaptive
Protection runs in detection only: it reports and proposes, it deploys nothing.

**The `/flows` exclusions are not cosmetic.** apps/id, apps/console, Hydra and
all reach Kratos and Hydra through these hostnames, from one shared
Cloud Run egress address. A per-IP rule that can match one of those calls bans
the whole environment the first time it trips. Anything added here has to be a
path only a browser reaches; `/self-service/<type>/flows`, `/sessions/*`,
`/self-service/logout/*`, `/self-service/errors` and the JWKS are not.

### Did Armor do this?

```
gcloud logging read 'resource.type="http_load_balancer"
  AND jsonPayload.enforcedSecurityPolicy.name="id-dev-armor"
  AND jsonPayload.enforcedSecurityPolicy.outcome="DENY"' \
  --project <p> --limit 20 --format='value(jsonPayload.enforcedSecurityPolicy.configuredAction,httpRequest.requestUrl,httpRequest.remoteIp)'
```

`previewSecurityPolicy` rather than `enforcedSecurityPolicy` for rules running in
preview. Both need load balancer request logging, which `armor_request_logging`
keeps on for exactly this reason; with it off there is nothing to read.

### Tuning during an incident

Every threshold is a variable, so none of this is a code change. Unset fields
keep their module default, so one number moves alone:

```
terraform apply -var 'armor_rate_limits={login={count=200,ban_duration_sec=60}}'
terraform apply -var armor_preview_only=true     # log every deny, act on none
terraform apply -var 'armor_exempt_host_keys=["console"]'
terraform apply -var armor_enabled=false         # delete the policy
```

`armor_preview_only=true` is the first move when sign-in breaks and Armor is a
suspect: it keeps the rules and the logs and stops them acting, so the next
request either proves or clears the policy.

### What it does not cover

- **Distributed stuffing.** Every rule keys on IP, which is all Cloud Armor can
  key on here; the client id at `/oauth2/token` is in the request body and the
  identifier in a login flow is too. A run spread thin across many addresses
  stays under every threshold above.
- **`/oauth2/token` as a secret-guessing brake.** Its legitimate callers are
  servers, so the allowance has to cover a whole client's refresh traffic from
  one address. 300 a minute stops a runaway, not a patient guesser.
- **Flow creation.** `GET /self-service/<type>/browser` is inside the rules, but
  a run that only mints flows and never submits writes a row per attempt and
  stays well under the submission thresholds.
- **The console.** Attached, but nothing in the policy plausibly matches it: the
  rate-limited paths do not exist on that host and the scanner rule needs a
  scanner's own User-Agent. It is gated to staff at aal2 in the app, and locking
  staff out would cost more than the abuse a rule there would prevent.
- **SQLi and XSS presets.** Deliberately absent, and the header comment in
  `armor.tf` says why: a Kratos form POST carries a password and Cloud Armor
  inspects urlencoded bodies as arguments, so a preset that reads arguments will
  eventually 403 somebody's correct password.

## Alerting

`infra/environments/*/monitoring.tf`, one copy per environment. Everything in it
watches a failure that was previously silent, which is the selection criterion:
each of these answered `ok` on `/health/ready` while being broken.

### An alert with no channel is a page nobody reads

`alert_notification_channels` defaults to `[]`, so this applies in a project
where no address has been verified yet. Understand what that buys you: **the
policies still evaluate and still open incidents, and nothing is sent anywhere.**
Every alert below becomes a row in Cloud Monitoring's Alerting page that someone
has to think to visit, which is the same failure mode as having no alerting, with
more Terraform. It is a deployable default, not a working one.

Making it work is one step, out of band because a channel has to be verified by
whoever owns the address:

```
gcloud beta monitoring channels create --project <p> --display-name "oncall" \
  --type email --channel-labels=email_address=someone@example.com
```

Then put the returned `projects/<p>/notificationChannels/<id>` into
`alert_notification_channels` for that environment. The variable is a list, so a
second channel (Slack, PagerDuty) is additive.

### Uptime checks

Five, one per public host, at 300s from three regions. The path differs per host
because no single path is a health signal on all five, and the reasoning is in
the header comment of `monitoring.tf`. Two things are worth knowing before
changing one:

- **The checker follows redirects and carries cookies.** So `dev.id.os.build/login`
  reports a 200 after two hops, and that one check covers the app, Kratos's flow
  creation, and the app rendering the flow. It matches on `name="csrf_token"`,
  because without a content match a 200 from anywhere the chain ended would pass.
- **That same behaviour makes the obvious console check wrong.** `console.*/`
  307s to sign-in, which is on the id host, so a check there reports the sign-in
  app's health under the console's name. `/denied` is outside the gate matcher,
  answers 200 with no session, and never calls Kratos.
### Alert policies

| Policy | Fires on |
| --- | --- |
| `<env>: <host> unreachable` (×5) | more than one failed probe in a 20 minute window, per host |
| `<env>: console gate cannot reach Kratos` | `whoami unreachable` in `console-<env>` stderr |
| `<env>: Kratos courier cannot send mail` | `Unable to dispatch message`, `Unable to dial SMTP connection`, `Unable to send email using SMTP connection`, or `Message was abandoned because it did not deliver`, on any `kratos-*` service |
| `<env>: Kratos courier is not running` | `kratos-courier-<env>` reporting fewer than one instance, or reporting none at all, for 30 minutes |
| `<env>: Cloud Run revision failed to become ready` | a `system_event` audit entry whose status says `Ready condition status changed to False for Revision` |
| `<env>: Cloud SQL out of connections` | `too many clients already` or `remaining connection slots are reserved` in `postgres.log` |
| `<env>: IAM policy changed` | any `SetIamPolicy` / `SetIAMPolicy` / `setIamPolicy`, or `CreateServiceAccountKey`, in the activity log |

The IAM one fires on every `terraform apply` that touches a binding, and that is
the intent: the deploy noise is the baseline, and a change outside a deploy
window is the signal. `run.invoker` on `kratos-admin-<env>` is the grant to look
for, for the reason at the top of this document.

### Why the filters match text and not severity

Kratos and Hydra write plain lines to stderr and Cloud Run gives
those entries no severity at all, so `severity>=ERROR` matches none of them.
Kratos also logs its own courier failures at `level=warning`, so even its own
level is not the handle. Every log-based filter here matches on `textPayload`.

One consequence to preserve when editing: **no label extractor may read a
courier message's subject.** For code-based flows the subject *is* the plaintext
sign-in code (`Your buildOS sign-in code is 113699`), and a condition's labels
are copied into the notification.

### What is still not caught

A courier that is **running without `--watch-courier`**. Kratos logs nothing when
a message is queued and nothing when nothing dispatches it, so the queue fills in
complete silence; the only line that would prove the dispatcher exists is
`Courier worker started.`, which appears once at boot, and "this string is absent
for the current revision" is not a condition an alert policy can express. The
`courier is not running` policy above catches the case where the courier service
has no container, which is the other half of the same failure.

So it stays a manual check after any change to the courier service:

```
gcloud logging read 'resource.labels.service_name="kratos-courier-<env>"
  AND textPayload:"Courier worker started"' --project <p> --freshness=1h --limit=1
```

Nothing back means the dispatcher is not running, whatever `/health/ready` says.
The `courier_messages` query earlier in this document is the other half.

## Audit logging

`infra/environments/*/audit.tf`.

### Which log types, and which one costs

Admin Activity logs (create, update, delete, `SetIamPolicy`) are always on and
cannot be disabled. Data Access logs are off by default for everything, which is
why nothing currently records a secret being read. Two services are enabled here,
each with all three configurable types:

| Service | Type | Records |
| --- | --- | --- |
| `secretmanager.googleapis.com` | `ADMIN_READ` | listing secrets, reading their metadata |
| | `DATA_READ` | `AccessSecretVersion`, the only trace of a value actually being read |
| | `DATA_WRITE` | `AddSecretVersion` and friends |
| `cloudsql.googleapis.com` | `ADMIN_READ` | instance and operation reads |
| | `DATA_READ` | reads against databases and users |
| | `DATA_WRITE` | writes against databases and users |

The service name for Cloud SQL is `cloudsql.googleapis.com`, not the
`sqladmin.googleapis.com` that `apis.tf` enables. They are different names for
the same product and the audit config only accepts the former.

**`DATA_READ` is the one with a cost.** It is priced as log ingestion, and on a
busy project it is the type that generates volume, because it scales with use
rather than with administration. It
is affordable here for a specific reason worth not forgetting: Cloud Run reads a
mounted or injected secret **at instance start**, not per request, so Secret
Manager `DATA_READ` scales with revisions and cold starts. That reasoning stops
holding the moment something starts reading secrets at runtime. If a bill forces
a cut, `DATA_READ` is what to drop and `ADMIN_READ` plus `DATA_WRITE` is what to
keep.

Note also what these do **not** contain: SQL statements. Cloud Audit Logs record
Cloud SQL *API* calls. Queries are Postgres's own logging, in `postgres.log`.

### The sink, and the part of the control that is missing by default

`audit-logs-<env>` routes all four audit streams (`activity`, `data_access`,
`system_event`, `policy`) to a bucket with a retention policy, because the copy
in Logging's `_Default` bucket keeps 30 days and is deletable by anyone with
logging admin in the project.

`audit_log_bucket_project` defaults to null, meaning **the same project being
audited**. Be clear about what that does and does not give you: it protects the
trail from an application bug, an accidental `gcloud logging` command, and log
retention expiring. **It does not protect against a compromised project admin**,
who can delete the sink, delete the bucket, or turn the audit configs back off
before doing anything else. That is the entire threat the control exists for, and
same-project storage does not address it. Setting the variable to a project
nobody here administers is what makes it real; `unique_writer_identity` is
already on, so the sink can write across a project boundary unchanged.

Two smaller gaps in the same direction:

- `audit_log_retention_days` (400) stops an object being deleted, overwritten or
  archived before it elapses. Nothing deletes it afterwards; the policy is a
  floor, not a schedule, so the bucket grows.
- `audit_log_retention_locked` is off. An unlocked retention policy can be
  shortened or removed by whoever can edit the bucket, which is the same admin
  the control is aimed at. Locking makes it permanent and makes the bucket
  undeletable until every object is past retention. That irreversibility is the
  point and it is also why it is not the default: turn it on deliberately, in
  prod, once the retention period is the one you want to live with for good.

## Errors and what they actually mean

| Symptom | Cause |
| --- | --- |
| Console: `Cannot verify your session` | the gate could not reach Kratos. It logs `[console gate] whoami unreachable at <url>` with the reason |
| Console: `Unrecognised role` | `metadata_public.staffRole` holds a value this version does not know |
| Console: `Second factor required` | the identity has no TOTP or backup codes; only they can add them |
| Console redirect loop | a gate that redirects a valid-but-insufficient session into an auth flow. Kratos then has nothing to ask for and returns straight back |
| Console `Forbidden` from the load balancer | `allow_public = false` on a load-balancer-fronted service. The LB forwards anonymously, so IAM refuses the LB itself |
| `429` on a Kratos or Hydra endpoint, no Ory body | a Cloud Armor rate limit, not Ory's own. See [Cloud Armor](#cloud-armor) |
| `403` from the load balancer on a path with no credential | the scanner rule matched a User-Agent or an argument. `armor_preview_only=true` proves it |
| `Unable to locate the table` | the database was not migrated. Looks exactly like a broken image |
| Cloud Run will not start, no app logs | a secret with no enabled version |
| Certificate stuck `FAILED_NOT_VISIBLE` | it was created before the DNS record existed |
| Kratos flow bounces forever | session or CSRF cookies scoped host-only across two hostnames |
| Mail queued, never delivered | Kratos running without `--watch-courier` |
| `550 not authorized to send from …` | the courier sender is not on a verified domain |
| `AADSTS700016` | see [social-login.md](social-login.md); usually `common` against a single-tenant registration |
| `Failed to parse URL from undefined/...` | an environment variable read without a fallback |

## Things that are quiet when they break

- **A service-to-service call to a `*.run.app` URL.** Egress is
  `PRIVATE_RANGES_ONLY`, so it leaves the VPC, arrives as external traffic, and
  is refused by internal-and-load-balancer ingress. Use the load balancer
  hostnames.
- **Two Kratos deployments with different config.** The admin service overrides
  the image command to drop `--watch-courier`, because two couriers would both
  dispatch from `courier_messages`. It must otherwise stay identical.
- **An admin call to the wrong port.** A Cloud Run service exposes one port; the
  admin ports live on their own services. Calls to 4434 on the public service
  fail while the pages still render.
