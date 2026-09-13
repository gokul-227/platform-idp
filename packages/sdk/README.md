# `@aec-craft/platform-id-sdk`

The buildOS ID facts a consumer actually reads: the current session, its identity's traits, whether that identity is staff and at what role, and a logout URL.

A thin layer over `@ory/client-fetch`, not a wrapper around the Ory API. The Ory client is a peer dependency, generated from the same OpenAPI spec any hand-written client would be transcribed from, so anything outside this surface is one `FrontendApi` away rather than behind a re-declaration that would then own the drift.

## Reading a session

```ts
import { createIdClient } from "@aec-craft/platform-id-sdk";
import { cookies } from "next/headers";

const id = createIdClient({ kratosPublicUrl: process.env.KRATOS_PUBLIC_URL });

async function cookieHeader() {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

const viewer = await id.getViewer(await cookieHeader());
// { id, email, name, traits, isStaff, staffRole, assuranceLevel, session, identity }
```

Every call takes the request's `Cookie` header rather than reading one, so the same client serves a server component, a route handler and a script. `getViewer` derives all of it from one `/sessions/whoami` call; `getSession` returns the raw Ory `Session`; `getLogoutUrl` asks Kratos for a per-session logout token, which only Kratos can mint.

Each returns `null` rather than throwing. That includes the `403` a session that could still step up answers with: telling those apart is an authorization decision, and it belongs in a guard, not in a reader.

## `./identity`

The identity readers, with no runtime imports at all, for callers that evaluate them per request at the edge:

```ts
import { isStaff, staffRoleOf, traitsOf } from "@aec-craft/platform-id-sdk/identity";
```

The vocabulary they read (the schema ids, the role catalog and its labels) is defined once in `@aec-craft/platform-id-contracts`, which is internal, so it is bundled into `dist` rather than depended on. The types it defines travel on from here, because this surface is typed with them; the constants do not, so a role list is either a workspace importing contracts or the two strings `StaffRole` already constrains.

`staffRoleOf` reads `metadata_public.staffRole`, which only the Kratos admin API can write, and returns `null` for anything the vocabulary does not know: an authorization decision on an unrecognised string is a guess, and a guess here fails open. `staffRoleValueOf` gives the raw value, for callers configured with their own role vocabulary that have to tell "no role" from "a role I do not recognise".
