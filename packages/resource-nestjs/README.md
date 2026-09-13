# @aec-craft/platform-id-resource-nestjs

How a NestJS API trusts a caller of buildOS ID.

The API verifies one signature against the issuer's published keys and reads the
claims it stamped. It never calls the identity service, so it answers requests
while that service is down and adds no latency to any request.

## Wiring

```ts
// app.module.ts
import { APP_GUARD } from "@nestjs/core";
import { PlatformIdModule, PrincipalGuard } from "@aec-craft/platform-id-resource-nestjs";

@Module({
  imports: [PlatformIdModule.forRoot()],
  providers: [{ provide: APP_GUARD, useClass: PrincipalGuard }],
})
export class AppModule {}
```

Global on purpose. A guard applied per-controller is one somebody forgets on the
controller that matters, so protection is the default and opting out is the
visible act:

```ts
@Public()                       // health probes, metadata documents
@RequireAal("aal2")             // raise the floor for one route or controller
@CurrentPrincipal() principal: Principal
```

## Configuration

| Variable | What it is |
| --- | --- |
| `OIDC_ISSUER` | the issuer's public URL, exactly as it spells itself in `iss` |
| `OIDC_JWKS_URL` | where that issuer publishes its signing keys, usually its `/.well-known/jwks.json` |
| `OIDC_AUDIENCE` | this API's own public URL, which the issuer must also carry on the calling client's registered audience list |

Issuer and audience are both pinned. Without the issuer pin, any key set that
validates would do; without the audience pin, a token minted for another service
is accepted here. Neither has a safe default of "any".

## What a principal is

| Field | |
| --- | --- |
| `subject` | identity id for a person, client id for a service |
| `type` | `user` or `service` |
| `aal` | `aal0`, `aal1` or `aal2`; never absent |
| `email` | null when unknown |
| `staffRole` | null for an ordinary user, and on every OAuth token |
| `clientId` | null for a browser session |
| `claims` | everything the issuer signed, top level and under `ext` |

Read `type` before `sub`: it is a Kratos identity id for a person and a client id
for a service, and nothing else tells the two namespaces apart.

`staffRole` is read wherever the issuer put it, `ext` included, because that is
the only place consent writes it. So a gate on it is reachable over OAuth, and
three things bound it rather than the nesting: the audience, since a token only
reaches your API from a client registered against it; the role list your
deployment recognises; and your own assurance floor. Read the claim here, decide
on it there.

## Everything fails closed

An unrecognised `type` is refused rather than defaulted, because guessing `user`
hands a machine a person's reach and guessing `service` does the reverse. A
missing `aal` becomes `aal0`, which satisfies no requirement. `email` and
`staffRole` stay null rather than empty, so absent reads as unknown rather than
as "has none".

The refusal reason is logged and never returned. A forged signature, an expired
token and a token minted for another service are one `401` to the caller, because
telling them apart is the map an attacker wants.

The default assurance floor is `aal0`, which every verified caller clears. That
is deliberate: a service account has no assurance level to offer, so a higher
default would refuse every machine.

## Authentication only

Whether this caller may touch this row is a different question, answered against
the row's own group. It needs a row read, so it cannot honestly live in a guard:
a guard that reads rows lies about when it runs. See
[the gap analysis](https://github.com/aec-craft/platform-id/issues/9).
