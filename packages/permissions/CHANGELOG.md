# @aec-craft/platform-id-permissions

## 0.2.0

### Minor Changes

- [#27](https://github.com/aec-craft/platform-id/pull/27) [`0d646b7`](https://github.com/aec-craft/platform-id/commit/0d646b78239413ebd777df4e9ec89c59423579ce) Thanks [@mariusjb](https://github.com/mariusjb)! - The permission model leaves the repository. `namespaces.keto.ts` and the `keto.yml` that serves it are published, so a service authorizing against Keto boots its tests on the model this repo deploys rather than on a copy of it.

  The copy was the problem. Keto refuses tuples in a namespace it does not know, so a consumer's integration tests need this model present, and the only way to have it was to paste the file into that repository. Nothing fails when the two fall out of step: the suite keeps passing against a model production no longer runs, and `limit.max_read_depth` makes that worse, because a check that exhausts the budget is answered as a denial rather than an error. A version pin turns that into a bump somebody has to accept.

  `ory/keto/` stays the source. It is what the Keto image bakes and what the local stack mounts; the package copies from it at build time so there is one file in git.
