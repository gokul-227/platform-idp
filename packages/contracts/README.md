# `@aec-craft/platform-id-contracts`

One definition of every type and constant more than one workspace here reads: the identity shapes, the staff role catalog, the guard's denial reasons and the console's refusals.

## Internal, and never published

`"private": true`, deliberately. The package that consumes it, `@aec-craft/platform-id-sdk`, **is** published, so it cannot carry a runtime dependency on something no registry can resolve: an install of the SDK from GitHub Packages would fail on it.

So they list it in **`devDependencies`** as `workspace:*` and tsup **bundles** it. That means it must stay out of each package's tsup `external`, and each needs `dts: { resolve: [...] }` so the rolled-up `.d.ts` inlines these types instead of importing them. Nothing in either `dist/` may mention this package, in the JavaScript or in the declarations:

```sh
grep -Rn "platform-id-contracts" --include="*.js" --include="*.cjs" --include="*.d.ts" --include="*.d.cts" packages/sdk/dist
```

`apps/console` consumes it directly, because an app is never published either. It lists it in `dependencies` and in `transpilePackages`.

## No build step

This package is its source: plain `.ts` at the package root, no `dist`, no tsup.

That is what makes the type inlining above work. tsup resolves types for `dts.resolve` with the legacy node algorithm, which ignores `exports` maps entirely and looks for the subpath as a file under the package directory. Built to `dist/`, `@aec-craft/platform-id-contracts/identity/staff.roles` finds nothing, tsup marks it external, and every published `.d.ts` then imports a package the consumer cannot install. Shipping the source puts the file exactly where that resolver looks.

## Entry points

No barrel file, so every module is its own export path.

| Path | Holds |
| --- | --- |
| `./identity/identity.traits` | `IdentityTraits`, `IdentityMetadataPublic`, `IdentityFacts` |
| `./identity/identity.schema` | `STAFF_SCHEMA`, `DEFAULT_SCHEMA` |
| `./identity/staff.roles` | `STAFF_ROLES`, `StaffRole`, `ROLE_LABELS`, `ROLE_DESCRIPTIONS` |
| `./guard/guard.denials` | `StaffGuardDenialReason` |
| `./console/refusal.errors` | `RefusalErrors`, `RefusalCode`, `isRefusalCode` |
| `./common/platform-error` | `PlatformErrorSpec` |

## What belongs here

Vocabulary, and pure readers over it that need no import beyond these types. Anything that touches `@ory/client-fetch`, and anything that does I/O, belongs in the SDK: the identity readers (`traitsOf`, `staffRoleOf`, `isStaff`) stay there because that is where their surface is already published.

## No zod

The platform monorepo's contracts package uses zod for request schemas. There are none here yet, and the closest consumer is an edge middleware, so pulling a validator into that bundle to carry constants and interfaces is the wrong trade. zod arrives with the client-management API, which is the first surface that has requests to validate.
