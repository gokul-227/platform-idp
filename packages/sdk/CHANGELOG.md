# @aec-craft/platform-id-sdk

## 0.2.0

### Minor Changes

- [#124](https://github.com/aec-craft/platform-id/pull/124) [`b6f48d9`](https://github.com/aec-craft/platform-id/commit/b6f48d94d89e324947252794f74e3120eae95675) Thanks [@mariusjb](https://github.com/mariusjb)! - One staff role, and an authority derived from it.

  `STAFF_ROLES` is now `["admin"]`. `superadmin` is retired, so `staffRoleOf` returns `null` for an identity still carrying it — `staffRoleValueOf` still reports the written value for a caller that must tell "no role" from "one I do not recognise".

  Deciding who may hold the role is no longer a second role. `authorityOf(identity, roots)` reads a root from a configured address list, staff from the schema, and `admin` from the role beside it; `isRoot` is exported alongside it. A root is never written to an identity and never minted into a token, so removing an address from the list takes effect on the next request.

## 0.1.0

### Minor Changes

- [#3](https://github.com/aec-craft/platform-id/pull/3) [`0d11766`](https://github.com/aec-craft/platform-id/commit/0d1176602c643517ffca2bb94243167ccc00f53d) Thanks [@mariusjb](https://github.com/mariusjb)! - First release of the identity SDK.

  `platform-id-sdk` reads a Kratos session and the facts derived from it: the
  viewer, their traits, whether they are staff and at what role, and a logout
  URL. Every call takes the request's `Cookie` header, so it pulls in no
  framework request store, and `@ory/client-fetch` stays a peer rather than
  being re-wrapped.
