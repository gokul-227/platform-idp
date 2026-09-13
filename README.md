# platform-id

buildOS ID. The identity provider for the buildOS platform: who someone is, how
they prove it, and which applications may ask.

It is not the permission system. Whether a user may open a project is answered
by the platform's own API. This repository answers whether they are signed in,
at what assurance level, and whether the application asking is registered.

Relying parties integrate over plain OIDC and nothing else. The issuer is
`https://oauth.id.os.build`, with `oauth.dev.id.os.build` and
`oauth.test.id.os.build` for the non-prod environments. Nothing in the platform
monorepo may import from this repository except through the published packages
below.

## Layout

```
apps/
  id/          Sign-in surface on the environment root: Kratos flows, the OAuth
               consent screen, account settings. Internet-facing.
  console/     Operator console over the Kratos and Hydra admin APIs, gated to
               staff identities.
  debug/       Local-only example consumer of the client package. Never built
               into an image, never deployed.

packages/      What leaves the repository:
  sdk/               @aec-craft/platform-id-sdk
  client-nextjs/     @aec-craft/platform-id-client-nextjs, the one package an
                     app installs to sign people in
  resource-nestjs/   @aec-craft/platform-id-resource-nestjs, the API-side guard
  permissions/       @aec-craft/platform-id-permissions, the Keto model itself
  contracts/         the staff vocabulary and denial reasons, shared internally
  db/                the identity database: schema, migrations and reads; internal

ory/           One copy of every Ory config, baked onto the upstream images.
               kratos/ hydra/ keto/ (the OPL model) bootstrap/ postgres/
infra/         Terraform: modules, plus one stack per environment and a shared
               one owning the id.os.build zone.
compose.yaml   The local stack, including a mail catcher.
```

Three Ory services do the work. **Kratos** owns identities, credentials and
sessions. **Hydra** is the OAuth2 and OIDC provider; its public hostname is the
`iss` claim in every token it has ever minted, so that hostname is permanent.
**Keto** answers relationship questions against the model in `ory/keto`, and has
exactly one caller.

There is exactly one copy of each Ory config. Per-environment difference is an
environment variable, because Ory maps every scalar config path to one and the
variable wins. The single exception is the OIDC providers list, which is a list
and therefore has no path; it arrives as a mounted second config file.

## Development

Node >= 22.10, pnpm >= 10 (`corepack enable` picks up the pinned version),
Docker.

```sh
pnpm install                                                        # also installs the pre-commit hook
cp ory/kratos/kratos.local.example.yml ory/kratos/kratos.local.yml   # once; add real OIDC credentials
pnpm ory:up                                                         # Postgres, Kratos, Hydra, Keto, a mail catcher
pnpm db:migrate                                                     # this repo's own schema
pnpm dev                                                            # apps/id on :3200, apps/console on :3201
```

The stack binds the canonical Ory ports, so nothing else may hold them: 4433 and
4434 Kratos, 4444 and 4445 Hydra, 4466 and 4467 Keto. Admin and write ports are
bound to loopback, because none of them authenticate: whatever can reach them
holds full control.

Other scripts: `pnpm ory:down`, `pnpm ory:reset` (wipes the volume),
`pnpm ory:logs`, `pnpm ory:seed` (a demo OAuth2 client), `pnpm validate`
(typecheck + lint), `pnpm fix` (format + lint).

[`docs/local-development.md`](docs/local-development.md) has the rest, including
how to read a sign-in code out of the local stack.

## Documentation

Start with [`docs/README.md`](docs/README.md). Conventions for humans and agent
tools are in [`AGENTS.md`](AGENTS.md).
