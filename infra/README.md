# Infrastructure

Four GCP projects. Three run the stack; one owns DNS so the zone never depends
on an environment's state.

| Project | Holds |
| --- | --- |
| `platform-id-shared` | The `id.os.build` Cloud DNS zone, CAA, and per-env A records. |
| `platform-id-dev-502710` | dev stack at `dev.id.os.build` |
| `platform-id-test` | test stack at `test.id.os.build` |
| `platform-id-prod` | prod stack at `id.os.build` (zone apex) |

## Hostnames

Four per environment. The OIDC issuer must never move once tokens naming it
exist, and each surface owns its own name rather than sharing one behind a
path prefix.

| Host | Serves |
| --- | --- |
| `{base}` | sign-in app (`apps/id`) |
| `console.{base}` | operator console (`apps/console`) |
| `auth.{base}` | Kratos public — self-service flows |
| `oauth.{base}` | Hydra public — the OIDC issuer |

`{base}` is `id.os.build` in prod and `{env}.id.os.build` elsewhere.

Not routed: Kratos and Hydra **admin**, reachable only on their `*.run.app`
URL from inside the project, and **Keto**, which is `INGRESS_TRAFFIC_INTERNAL_ONLY`
with no host rule at all. None of these authenticate; network reach is the
entire control.

## Where config lives

One copy, in [`ory/`](../ory), baked onto the upstream image by a per-service
`Dockerfile`. A config change is therefore a new image with a git sha, not a
value edited in a console.

Nothing is templated per environment. Ory maps every config path to an env var
and the env value wins over the file, so `dev` and `prod` differ by env vars
and secrets only. This is deliberate: rendering config per environment is what
made the previous implementation's config pipeline necessary, and it produced a
UI toggle that silently did nothing until the next restart.

Ory OSS does not read config from the database. Identities, OAuth2 clients,
relation tuples and sessions live there; configuration does not.

## Apply order

The zone and the load balancers are mutually dependent, so it is two passes.

```sh
cd environments/shared && terraform init && terraform apply    # zone first
cd ../dev && terraform init && terraform apply                 # prints load_balancer_ip
cd ../shared && terraform apply -var lb_ip_dev=<ip>            # publish A records
```

Populate every secret before the first apply of an environment: Cloud Run will
not start a service whose secret has no enabled version.

```sh
gcloud secrets versions add kratos-secrets-cookie --data-file=- --project platform-id-dev-502710
```

Then delegate at the registrar: point the `id` label of `os.build` at the
nameservers from `terraform output name_servers` in `shared`.

## Two things that will bite

**Certificates are per hostname.** `cert_domains` creates one managed cert per
entry rather than one cert with every host as a SAN. That matters because a
multi-SAN cert is shared fate: adding a host rewrites the SAN list, rotates
that single cert, and drops HTTPS for every host on the proxy for 15 to 30
minutes. Split per host, adding a hostname creates a new independent cert and
the existing ones keep serving. A proxy takes up to 15, and SNI picks.

A new host is still not instant: its own cert shows `PROVISIONING` until DNS
resolves to the LB, so publish the A record first.

**Image tags are owned by the deploy workflow.** Each Cloud Run service is
created with a `:bootstrap` placeholder and `lifecycle.ignore_changes` on the
image, so `terraform apply` never reverts a deploy.

## Scaling

Bump `db_tier` and apply. prod is `db-custom-2-7680` and `REGIONAL` with
deletion protection; dev and test are `db-f1-micro`, `ZONAL`, and destroyable.
