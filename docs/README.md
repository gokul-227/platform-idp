# platform-id

The identity service behind buildOS: who someone is, how they prove it, and
which applications may ask. Three Ory services and two Next apps, one deployment
per environment.

It is not the permission system. Whether a user may open a project is answered
by the platform's own API; this repository answers whether they are signed in,
at what assurance level, and whether the application asking is registered.

## Documentation

| Document | What it answers |
| --- | --- |
| [architecture.md](architecture.md) | Which service does what, which hostname it lives on, how a sign-in actually flows |
| [local-development.md](local-development.md) | Running the whole stack on a laptop, and reading codes out of it |
| [identities.md](identities.md) | Schemas, credentials, sign-in methods, and how console access is granted |
| [authorization.md](authorization.md) | Authorities, standings, and the API shape over Keto; why partition and access are different columns |
| [oauth-clients.md](oauth-clients.md) | Registering applications, the consent flow, and what tokens carry |
| [guarding-an-app.md](guarding-an-app.md) | Registering an application and signing people in, and why the console is the exception |
| [social-login.md](social-login.md) | Registering with Google and Microsoft, and where the credentials go |
| [deploy.md](deploy.md) | Terraform layout, the order that works, and the traps that cost hours |
| [operations.md](operations.md) | Bootstrapping the first operator, break-glass, rotation, common errors |

## Repository layout

```
apps/
  id/                  Next app on the environment root: sign-in, registration,
                       recovery, verification, OAuth consent, account settings
  console/             Next app on console.*: operator surface over the Kratos
                       and Hydra admin APIs, gated to staff identities
  debug/               local-only example OAuth client; never built into an
                       image and never deployed
packages/
  contracts/           the staff vocabulary and denial reasons, internal
  sdk/                 @aec-craft/platform-id-sdk
  client-nextjs/       @aec-craft/platform-id-client-nextjs, the one package an
                       app installs: sign-in for a client registered in the
                       console
  resource-nestjs/     @aec-craft/platform-id-resource-nestjs, the guard an API
                       puts in front of its routes
  permissions/         @aec-craft/platform-id-permissions, the Keto model, so a
                       repository authorizing against Keto boots its tests on
                       the deployed model rather than a copy
ory/                   One copy of every Ory config, baked onto upstream images
  kratos/              kratos.yml, both identity schemas, claim mappers,
                       branded courier templates
  hydra/               hydra.yml
  keto/                keto.yml and the namespace model (OPL)
  bootstrap/           job that grants the first operator console access
  postgres/            local-only init for the shared dev database
infra/
  modules/             cloud-run, cloud-run-job, cloud-sql, load-balancer, network
  environments/
    shared/            the id.os.build DNS zone and its per-environment records
    dev/ test/ prod/   one stack each; the diff between them is a handful of lines
compose.yaml           the local stack, including a mail catcher
```

There is exactly one copy of each Ory config. Per-environment difference is
expressed as environment variables, because Ory maps every scalar config path to
one and the variable wins. The exception is the OIDC providers list, which is a
list and therefore has no path; it arrives as a mounted second config file. See
[social-login.md](social-login.md).

## The four hostnames per environment

| Host | Service | Why it is separate |
| --- | --- | --- |
| `{env}` | apps/id | The human-facing surface owns the shortest name |
| `auth.{env}` | Kratos public | Self-service flows and the OIDC callback target |
| `oauth.{env}` | Hydra public | The OIDC issuer, which can never move once tokens exist |
| `console.{env}` | apps/console | Operator surface, load-balancer ingress only |

Kratos and Hydra admin APIs are not on the load balancer. They authenticate
nobody by design, so reach is the only control: they run as separate Cloud Run
services that accept no anonymous invocation. Keto is not routed at all.

Base domains: `id.os.build` (prod), `test.id.os.build`, `dev.id.os.build`.

## Known gaps

Tracked so nobody rediscovers them:

- **Scope is not enforced.** A resource server pins the audience, so a token is
  only accepted by the API it names, but nothing reads `scp`. A client consented
  for `openid` therefore holds the subject's full reach at that API.
- **No dynamic client registration.** Hydra's `/oauth2/register` is disabled
  because it authenticates nobody, so applications are created by an operator in
  the console. Self-service registration needs an authenticated surface of our
  own; see [oauth-clients.md](oauth-clients.md).
- **The console gate is in the app,** not at the edge. It checks facts an edge
  could assert instead, so moving it is configuration rather than a rewrite.
- **VPC Service Controls.** Not configured, so a leaked credential works from
  anywhere. It has to arrive as a dry-run perimeter first: an incorrect one locks
  everyone out of the project, including whoever would fix it.
- **Binary Authorization is configured but inert.** The policy runs in dry-run
  and no service opts in yet, so an unattested image still starts. The order is
  in [deploy.md](deploy.md): dry-run, deploy so attestations exist, check the
  dry-run log names the digests the workflow signed, then opt in, then enforce.
- **CMEK on dev and test.** Cloud SQL binds a key at creation, so only prod
  starts with one; moving the others means rebuilding them.
