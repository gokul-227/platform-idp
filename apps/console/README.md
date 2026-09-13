# @aec-craft/console

The operator surface over the Kratos and Hydra admin APIs. The only service that
can create or modify an identity or an OAuth client.

Its own app rather than a route group inside `apps/id`, so the internet-facing
sign-in surface holds no Kratos admin credential. That split is the security
boundary, not a layout preference.

```sh
pnpm ory:up
pnpm --filter @aec-craft/console dev     # http://localhost:3201
```

An operator has to exist before anyone can sign in; the bootstrap job seeds the
first one. `ROOT_EMAILS` names them, and `src/lib/roots.ts`
derives break-glass from that same value: the one account that cannot be absent,
revoked or demoted, because it comes from configuration rather than from
anything stored in Kratos. See
[`docs/operations.md`](../../docs/operations.md).

## The gate

`src/proxy.ts` is the whole of it: a staff identity on the `staff` schema,
carrying a known `staffRole`, at `aal2`. Four conditions, each with exactly one
response, and the reasoning lives in `src/lib/staff.guard.ts`.

`/denied` and `/logout` sit outside the matcher deliberately. `/denied` has to
answer without a session to say why and offer the way out, and `/logout` is the
way out of a wrong session, so gating it would make it unreachable by exactly
the identities that need it.

Nothing reaches the app around that check: the Cloud Run service takes
load-balancer ingress only, so its `*.run.app` URL 404s and the balancer is the
single path in. IAM cannot be the control here, because the load balancer
forwards without a caller identity.

The gate is in the app rather than at the edge. It checks facts an edge could
assert instead, so moving it later is configuration and not a rewrite.

## Sections

Declared in `src/components/console.nav.tsx`. The sidebar is the only consumer,
so adding a section is one entry there plus a route folder, and nothing else
enumerates them.

- **Overview**: identity and application counts, Kratos and Hydra readiness,
  recent identities.
- **Identities**: searchable list; create with a pre-verified email; detail with
  traits, addresses, credential methods, session revocation, activate and
  deactivate, recovery-code hand-off, delete.
- **Applications**: OAuth2 client registrations. Create with a one-time secret
  reveal, detail with redirect URIs, delete. Each carries an `owner` (an org id,
  empty for platform-level) so an org-side surface can later list only its own.

## What it deliberately does not do

**It writes no Keto tuples.** This repository owns the permission model and runs
the two Keto services; the writes belong to the platform's `permissions-api`,
which is where the escalation guard and the audit row live. A console that wrote
tuples would be a second writer with its own copy of that guard.

Admin calls go straight from a server component or server action to Ory. There
is no service tier in between and no reason to add one: a proxy route in front
of the Admin API only re-declares it.

Platform is read and written from the browser through `@aec-craft/platform-admin-sdk`'s
hooks, the way the platform app's settings surface uses `@aec-craft/platform-sdk`:
a click is a mutation with its own pending state, a failure is a toast, and a
success invalidates the cache. The clients point at `/api`, which
`app/api/[...path]/route.ts` relays to the platform API with the operator's own
token attached, so the token never reaches client JavaScript. `proxy.ts` obtains
that token before any page renders. Only the server side of deleting an identity
still calls the admin SDK from Node, because the Kratos half cannot happen
anywhere else.
