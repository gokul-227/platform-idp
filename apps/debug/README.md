# @aec-craft/debug

A four-route Next app that does nothing but demonstrate
`@aec-craft/platform-id-client-nextjs`. The guide is
[docs/guarding-an-app.md](../../docs/guarding-an-app.md); this is the code it
refers to.

```
pnpm --filter @aec-craft/debug dev     # http://localhost:3202
```

Needs the local stack up (`pnpm ory:up`) and the sign-in app on 3200.

| Path | What it is |
| --- | --- |
| `src/proxy.ts` | the entire consumer surface of the guard |
| `src/app/page.tsx` | guarded; prints the facts the guard checked |
| `src/app/denied/page.tsx` | outside the guard, because it must answer without a session |
| `src/app/logout/route.ts` | outside the guard, because it is the way out of a wrong session |

It is configured as a customer-facing consumer (any schema, no role, one
factor), which is the shape nothing else covers: `apps/console` exercises the
staff preset on every request.

## Local only

No Dockerfile, no terraform, no `output: "standalone"`. A deployable example is
another surface to secure for no benefit. If this ever needs to be reachable by
someone else, that is a decision to take deliberately, not by adding a Dockerfile.
