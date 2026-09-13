# Running it locally

## Start

```
pnpm install
docker compose up -d --wait     # postgres, kratos, hydra, keto, mail catcher
pnpm dev                        # both Next apps
```

| URL | What |
| --- | --- |
| http://localhost:3200 | apps/id: sign-in, registration, account settings |
| http://localhost:3201 | apps/console: operator surface |
| http://localhost:3202 | apps/debug: the guard example, started on its own |
| http://localhost:4433 | Kratos public |
| http://localhost:4434 | Kratos admin (loopback only) |
| http://localhost:4444 | Hydra public |
| http://localhost:4445 | Hydra admin (loopback only) |
| http://localhost:4466 / 4467 | Keto read / write |
| http://localhost:4436 | mail catcher UI (API on 4437) |

Ports 5442 and up are the local Postgres. The admin ports are bound to
`127.0.0.1` on purpose, so they are not on the LAN. Note that this makes them
IPv4-only, and Node resolves `localhost` to `::1` first: reach the admin API as
`127.0.0.1:4434` from scripts.

The apps need no `.env` file. Defaults in `apps/*/src/lib/env.ts` match the
compose ports.

## Getting a sign-in code

The compose stack ships a mail catcher, and Kratos delivers to it unless
`COURIER_SMTP_CONNECTION_URI` is set in the root `.env`, in which case mail goes
to that provider and reaches a real inbox.

Either way, the code is also in the database, which is the fastest way to read it
and works regardless of delivery:

```
docker exec platform-id-postgres-1 psql -U id_app_role -d kratos \
  -tAc "select subject from courier_messages order by created_at desc limit 1"
```

The subject carries the code. Do not parse the HTML body for six digits: it
contains hex colours.

## Reaching the console locally

The gate applies locally too, so a fresh stack refuses you: it needs an identity
on the `staff` schema, carrying a role, at `aal2`.

`docker compose up` runs the `bootstrap` service, the same script the deployed
Cloud Run job runs, which creates a `superadmin` for `STAFF_EMAIL` (default
`marius@neobim.ai`). It is idempotent, so it neither duplicates nor resets anyone
on a later `up`. That covers step 1 and 2 below; you still have to do step 3
yourself, because nothing can enrol a second factor on your behalf.

It refuses rather than helps in one case: the email already exists on another
schema. That is deliberate, since the alternative is silently rewriting what may
be a real tenant account. The `PATCH` below is the deliberate resolution, and it
switches the schema in place, keeping the identity's existing credentials.

To grant access to a different account:

1. Register at http://localhost:3200/registration with any address.
2. Grant it console access. Two ways:
   - from a console that already has a superadmin, on the identity's page
   - on a fresh stack, directly through the admin API:
     ```
     ID=$(curl -s "http://127.0.0.1:4434/admin/identities?credentials_identifier=you@example.com" \
       | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
     curl -X PATCH "http://127.0.0.1:4434/admin/identities/$ID" \
       -H "Content-Type: application/json" \
       -d '[{"op":"replace","path":"/schema_id","value":"staff"},
            {"op":"replace","path":"/metadata_public","value":{"staffRole":"superadmin"}}]'
     ```
3. Enrol an authenticator app at http://localhost:3200/account. Nobody can do
   this for you: Kratos has no admin API for enrolling TOTP.
4. Open http://localhost:3201.

## Social login locally

Real credentials go in `ory/kratos/kratos.local.yml`, which is gitignored and
loaded by compose as a second `--config` after `kratos.yml`. Copy
`kratos.local.example.yml` and fill it in. That array replaces the placeholder
one wholesale, so list every provider you want.

Register the callback upstream as
`http://localhost:4433/self-service/methods/oidc/callback/<provider id>`. See
[social-login.md](social-login.md).

## Resetting

```
pnpm ory:reset      # down -v && up: drops every identity, client and session
```

`docker compose up -d --force-recreate kratos` is enough after a config change,
and discards that container's logs, so read them before recreating.

## Checks

```
pnpm lint           # ultracite (biome)
pnpm fix            # and fix
pnpm -r exec tsc --noEmit
pnpm build
```

`pnpm fix` reformats and will fight exact-string edits to HCL and TSX; run it
before committing, not in the middle of a scripted edit.
