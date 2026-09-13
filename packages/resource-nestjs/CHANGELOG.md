# @aec-craft/platform-id-resource-nestjs

## 0.4.0

### Minor Changes

- [#128](https://github.com/aec-craft/platform-id/pull/128) [`79e2a96`](https://github.com/aec-craft/platform-id/commit/79e2a962092dfa101699d3201bcad6076f8ec882) Thanks [@mariusjb](https://github.com/mariusjb)! - `toPrincipal` reads `staffRole` from `ext` as well as the top level, like every other claim it maps.

  Hydra nests what a consent decision adds under `ext`, so the previous top-level-only read returned `null` on every token this issuer mints. A resource server gating on `staffRole` therefore refused every caller, admins included. `client-nextjs` has always read the nested claim, so the two readers now agree.

  **Consumers must deploy a role-aware guard before taking this.** A gate that admits on the presence of `staffRole` alone will start admitting real tokens; it should require the identity schema and a listed role, with its own assurance floor.

## 0.3.0

### Minor Changes

- [#91](https://github.com/aec-craft/platform-id/pull/91) [`6500716`](https://github.com/aec-craft/platform-id/commit/65007167e147a212fc5c125c5550a7c734ddcd85) Thanks [@mariusjb](https://github.com/mariusjb)! - `GATEWAY_VERIFIER` becomes `TOKEN_VERIFIER`.

  Oathkeeper is gone. Nothing mints a token but Hydra, and this package verifies
  that signature against the issuer's published keys, so the injection token named
  a component no consumer could point at. The string value moves with it:
  `PLATFORM_ID_GATEWAY_VERIFIER` becomes `PLATFORM_ID_TOKEN_VERIFIER`.

  Breaking for anything injecting the verifier by token, which nothing does today:
  `PlatformIdModule.forRoot()` provides it and `PrincipalGuard` consumes it, and
  those are the two names consumers actually use. A minor rather than a major
  because this is a 0.x line, where a caret does not cross one.

  No behaviour changes. The rest of the diff is comments and a package
  description that described the same absent component.

## 0.2.0

### Minor Changes

- [#44](https://github.com/aec-craft/platform-id/pull/44) [`4290b7e`](https://github.com/aec-craft/platform-id/commit/4290b7e09af057001b80c71724edf288fd229ef8) Thanks [@mariusjb](https://github.com/mariusjb)! - A verifier refuses to be built without an issuer, a JWKS URL and an audience.

  All three had localhost defaults, and each was a way for a misconfigured service to boot successfully and then answer 401 to every gated route, with nothing anywhere saying why. That is not a hypothetical: it is the shape of a debugging session this change came out of.

  They were also only fail-closed by accident. The defaults pinned a cleartext issuer on the loopback interface and fetched the trust anchor from it over plain HTTP, so any process able to answer on that port became an issuer the API trusts. And `DEFAULT_AUDIENCE` was a bare name rather than a URL, so where it happened to match a real audience the audience pin added nothing.

  By the end they could not have been correct anywhere: `http://localhost:4455/` and `http://localhost:4456/.well-known/jwks.json` are Oathkeeper's ports, and the gateway was removed.

  Missing config now throws at construction, naming the option, the environment variable, and what the value is meant to be. There is no `NODE_ENV` exemption, because a local default is only worth keeping if local development uses it: every consumer already states all three explicitly, so the defaults served nothing but the misconfigured case. An empty environment value counts as missing.

  The environment fallbacks are renamed `OIDC_AUDIENCE`, `OIDC_ISSUER` and `OIDC_JWKS_URL`, from `GATEWAY_*`, which named the component that no longer exists. Nothing set the old names, and `OIDC_ISSUER` is what consumers already have in their environment.

  Breaking for any consumer that relied on a default or on a `GATEWAY_*` variable. Pass `audience`, `issuer` and `jwksUrl` to `PlatformIdModule.forRoot`, or set the three variables.

## 0.1.2

### Patch Changes

- [#35](https://github.com/aec-craft/platform-id/pull/35) [`626b427`](https://github.com/aec-craft/platform-id/commit/626b427922e1fea6750f278fbe0db7911518cc81) Thanks [@mariusjb](https://github.com/mariusjb)! - Read principal claims from `ext` as well as the top level. An access token carries what it was given at consent nested under `ext`, so a top-level-only read found none of it and each value silently took its fail-closed default: `aal` became `aal0` and `email` became null on a token that stated both. `client_id` is also read in the underscore spelling the issuer uses. `staffRole` stays top-level only, so a grant cannot assert operator reach.

## 0.1.1

### Patch Changes

- [#20](https://github.com/aec-craft/platform-id/pull/20) [`6aeec5e`](https://github.com/aec-craft/platform-id/commit/6aeec5e99c4a6bb29653317f3f311ef38120e4cd) Thanks [@mariusjb](https://github.com/mariusjb)! - Derive `type` when the token does not state it. A gateway-minted token carries the claim; a token straight from Hydra does not, so verifying one against the issuer directly always failed with `not-a-principal` even though the signature, issuer and audience were all correct.

  The derivation is the gateway's own rule — a subject that is the client itself is a machine, anything else is a person acting through that client — so both paths agree on the answer. A `type` that is stated but unrecognised is still refused.

- [#27](https://github.com/aec-craft/platform-id/pull/27) [`0d646b7`](https://github.com/aec-craft/platform-id/commit/0d646b78239413ebd777df4e9ec89c59423579ce) Thanks [@mariusjb](https://github.com/mariusjb)! - `staffRole` is no longer put into a delegated token, so `session.staffRole` is null on every OAuth session and a `Principal` carrying a role can only have come from a browser session.

  The consent step emits `aal`, `email` and `schema`, which describe the person. A console role grants: the platform API opens its operator routes to any caller asserting one. Every client asks for the same four scopes and holds the token it receives, so emitting the role gave operator reach to every application an operator ever signed into. A delegated operator surface needs a scope consented to for that purpose, which only a first-party client may request.

- [#20](https://github.com/aec-craft/platform-id/pull/20) [`6aeec5e`](https://github.com/aec-craft/platform-id/commit/6aeec5e99c4a6bb29653317f3f311ef38120e4cd) Thanks [@mariusjb](https://github.com/mariusjb)! - The default audience is `platform-api`, which is the service's actual name. `buildos-api` never matched anything deployed.

## 0.1.0

### Minor Changes

- [#12](https://github.com/aec-craft/platform-id/pull/12) [`bdad906`](https://github.com/aec-craft/platform-id/commit/bdad9061c467cecd9159ebfa25a5ee742ef8999b) Thanks [@mariusjb](https://github.com/mariusjb)! - First release. Verifies a gateway-minted RS256 token against the published key set and attaches the caller, with no call to the identity service on any request.

  Authentication only: whether a caller may touch a row is answered against that row's group, which needs a row read and therefore cannot live in a guard.
