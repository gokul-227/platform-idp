# @aec-craft/platform-id-client-nextjs

## 0.6.0

### Minor Changes

- [#152](https://github.com/aec-craft/platform-id/pull/152) [`84bb5cb`](https://github.com/aec-craft/platform-id/commit/84bb5cbefa2c00024cae360e3d36bc3c1a4af5e3) Thanks [@mariusjb](https://github.com/mariusjb)! - `clearSession(response)` and `sessionOf(request)`: an app's own sign-out drops this platform session from the response it sends to the identity provider, and a proxy can read the token's subject off the request to compare it with the person signed in. Both were needed to close the gap where a sign-out left the token in the browser and the next person to sign in was served it.

## 0.5.0

### Minor Changes

- [#142](https://github.com/aec-craft/platform-id/pull/142) [`1018710`](https://github.com/aec-craft/platform-id/commit/10187100713992c31e3e53caa1a208429cbc4b20) Thanks [@mariusjb](https://github.com/mariusjb)! - `requiredAal`: the gate reads the `aal` claim of the token it holds and re-authorizes when it says less than the app needs. A token states the assurance level the session had when it was minted and keeps it through every refresh, so an app whose resource server gates on `aal2` would otherwise forward a token minted before the second factor until the refresh chain ended.

## 0.4.0

### Minor Changes

- [#148](https://github.com/aec-craft/platform-id/pull/148) [`b06ac9f`](https://github.com/aec-craft/platform-id/commit/b06ac9f02fab9a5fe42c3b6446fe28dd8988833f) Thanks [@mariusjb](https://github.com/mariusjb)! - `requiredAal`: the gate reads the `aal` claim of the token it holds and re-authorizes when it says less than the app needs. A token states the assurance level the session had when it was minted and keeps it through every refresh, so an app whose resource server gates on `aal2` would otherwise forward a token minted before the second factor until the refresh chain ended.

## 0.3.0

### Minor Changes

- [#42](https://github.com/aec-craft/platform-id/pull/42) [`7567ab6`](https://github.com/aec-craft/platform-id/commit/7567ab68030ba43374a3599402cffab82b3cf004) Thanks [@mariusjb](https://github.com/mariusjb)! - The client asks for an audience, and the forward handler strips its own prefix.

  `apiUrl` is sent as `audience` on the authorization request, the token exchange and the refresh, where it was previously RFC 8707 `resource`. Hydra accepts `resource` and ignores it, so a token requested that way arrives with an empty `aud` and the resource server refuses it: sign-in looks entirely successful and every relayed call answers 401, with nothing in this app able to see why. The value must also appear in the client's registered audience list, or it is dropped the same silent way.

  `handlers.forward` now strips a leading `/api` before forwarding. The prefix belongs to the consuming app, and exists so browser calls stay same-origin and reach the handler that holds the token; the platform API serves its routes at the root, so `/api/me` upstream is `/me`. Forwarding the path intact answers 404 on routes that plainly exist.

  Breaking for a consumer whose `apiUrl` points at something that strips the prefix as well, which would now lose it twice. `apiUrl` is expected to name the resource server directly. The gateway that used to sit in front of it, and did its own matching and stripping, no longer exists.

## 0.2.0

### Minor Changes

- [#26](https://github.com/aec-craft/platform-id/pull/26) [`d66a2ea`](https://github.com/aec-craft/platform-id/commit/d66a2eaf44a2498ed7acec8e7166d8f8127f2ac1) Thanks [@mariusjb](https://github.com/mariusjb)! - `handlers.forward` relays browser calls to the platform API with the access token attached, and `apiUrl` carries the RFC 8707 resource indicator on every token request.

### Patch Changes

- [#27](https://github.com/aec-craft/platform-id/pull/27) [`0d646b7`](https://github.com/aec-craft/platform-id/commit/0d646b78239413ebd777df4e9ec89c59423579ce) Thanks [@mariusjb](https://github.com/mariusjb)! - `staffRole` is no longer put into a delegated token, so `session.staffRole` is null on every OAuth session and a `Principal` carrying a role can only have come from a browser session.

  The consent step emits `aal`, `email` and `schema`, which describe the person. A console role grants: the platform API opens its operator routes to any caller asserting one. Every client asks for the same four scopes and holds the token it receives, so emitting the role gave operator reach to every application an operator ever signed into. A delegated operator surface needs a scope consented to for that purpose, which only a first-party client may request.

- [#27](https://github.com/aec-craft/platform-id/pull/27) [`0d646b7`](https://github.com/aec-craft/platform-id/commit/0d646b78239413ebd777df4e9ec89c59423579ce) Thanks [@mariusjb](https://github.com/mariusjb)! - Remember a refresh exchange for a minute after it settles, rather than only while it is in flight.

  Deduplicating concurrent exchanges was not enough to stop Hydra revoking the chain. A browser sends several requests carrying one cookie; the first rotates the token, and any of the others that arrives after that exchange settled presents a token this process has already spent. Hydra reads the second use as a breach and revokes everything, which signs the person out roughly ten minutes after they last navigated. Retaining the result turns the late caller into a second reader of an answer we already hold, which is the correct one. A failed exchange is still not retained, so a transient failure is retried.

  The remaining race is between runtimes: a Next app answers its proxy and its route handlers in separate ones, so the gate and the relay each hold their own map and can each spend the same token once. Only the issuer can cover that, and buildOS ID now configures `oauth2.grant.refresh_token.rotation_grace_period`.

## 0.1.0

### Minor Changes

- [#13](https://github.com/aec-craft/platform-id/pull/13) [`c56ced0`](https://github.com/aec-craft/platform-id/commit/c56ced040f15c5aef330ffcb00b76bb843e336d8) Thanks [@mariusjb](https://github.com/mariusjb)! - First release. How a Next.js application signs people in with buildOS ID: authorization code with PKCE against Hydra as `createIdClient()`, giving a proxy gate, three route handlers and a read-only `getSession()`.

  An app using it is registered rather than configured. Its client id and secret come from the console, and the issuer validates its redirect URI against that record, so adding an application changes nothing about the identity service or its infrastructure.

  The gate renews from the refresh token rather than restarting the authorization flow. Hydra issues a ten minute access token, so without renewal a signed-in visitor would be walked back through sign-in every ten minutes.

  Claims arrive nested under `ext`, which is where Hydra puts whatever the consent step granted, so `aal`, `email`, `staffRole` and `schema` are unwrapped and exposed as first-class fields.
