# Agent guide for platform-id

Single source of truth for repo conventions, shared across agent tools. Claude Code loads it via the `@AGENTS.md` import in `CLAUDE.md`. Keep it terse and project-specific; user-level preferences belong in `~/.claude/`.

This repo is **BuildOS ID**: the identity provider for the BuildOS platform, served at `id.os.build` (prod) and `id.{env}.os.build` (dev/test). It holds the IdP configuration, its infrastructure, and the self-service auth UI (login, registration, recovery). The platform talks to it over plain OIDC; nothing in the platform monorepo may import from this repo directly.

Conventions mirror `aec-craft/platform`; the sections below are the subset that applies here. Generic code quality (formatting, lint-level best practices) is enforced by Biome via ultracite; run `pnpm fix` before committing.

## Documentation lives in `aec-craft/docs`

Every document is written there and served at `/internal/platform/identity/…`.
None is written here, because a page in a product repository cannot know whether
it duplicates a page in another one, or whether a change three repositories away
made it wrong — and neither can an agent that only sees this checkout.

**A change that needs a documentation change is two pull requests.** Pull
`aec-craft/docs`, find the page that covers what you changed, update it there, and
open it alongside this one. Do not write the explanation here instead. The
coordination cost is deliberate: it doubles as a review gate, because whoever owns
a document is not always whoever owns the service.

`AGENTS.md`, `README.md` and `.env.example` stay. They are instructions to whoever
is in the checkout, not documentation of the system.

## Layout

- `apps/` — deployable workspaces. `id` is the internet-facing sign-in surface (Kratos flows, Hydra consent, account settings); `console` is the operator surface over the admin APIs. The IdP itself (Ory) is not a workspace; it is configuration.
- `ory/` — Ory service configuration (identity schemas, flow config), one directory per service. `ory/keto`'s two files are published as `@aec-craft/platform-id-permissions`, which `packages/permissions` copies them into at build, so a repository that authorizes against Keto boots its tests on the deployed model instead of a copy; edit them here, and they travel as a version bump.
- `packages/` — what leaves the repository: the OAuth client, the resource-server guard, the session reader, and the permission model above. Nothing in the platform monorepo may reach past these.
- `compose.yaml` — the local Ory stack, at the root because it spans every service in `ory/`.
- `infra/` — Terraform for the `id.*` hostnames, certificates, and service deployment.

## Talking to Ory

- **Use the official SDK.** `@ory/client-fetch` for TypeScript, generated from the same OpenAPI spec a hand-written client would be transcribed from. Never hand-roll an HTTP client for an Ory API; the previous implementation did that twelve times and owned the drift.
- **Call the Admin API from server components and server actions.** There is no service tier between this app and Ory, and there is no reason to add one: a proxy route in front of the Admin API only re-declares it. Admin ports stay off the public network.
- **The split is end-user versus operator, not anonymous versus signed-in.** `apps/id` gets Kratos's frontend API (and Hydra admin, unavoidably, because the consent contract requires accepting the challenge). Kratos admin belongs to `apps/console`, so the internet-facing app cannot mint a recovery link or delete somebody else's identity. Account settings stay in `apps/id`: they use the same frontend API and the same session as the flows.
- **One exception, and it stays one.** Closing your own account is an admin call, because Kratos has no self-service deletion flow, so `apps/id` holds Kratos admin for that alone. What keeps it narrow is `lib/account.deletion.ts`: the client is private to that module, nothing exported takes an identity id, and the subject comes from the session cookie the visitor presented. Adding a second admin call means exporting a client, which is the whole capability one import away; put the next one in the console instead.
- **Ory config is files.** `kratos.yml` plus a gitignored `kratos.local.yml` overlay for real credentials; Kratos merges repeated `--config` natively. Do not build a templating or rendering step around it.
- **Console sections are declared in `apps/console/src/components/console.nav.tsx`.** Adding one is an entry there plus a route folder; nothing else enumerates them.

## Writing Keto tuples

**Nothing in this repo writes them.** This repo owns the model (`ory/keto`, published as `@aec-craft/platform-id-permissions`) and runs the two services; the writes belong to the platform's `permissions-api`, which is the only caller of either surface and the only place the escalation guard and the audit row exist. A console that wrote tuples would be a second writer with its own copy of that guard. The rules below are the model's, and apply wherever the writes live.

- **`PUT /admin/relation-tuples` is not idempotent.** The same tuple written twice is stored twice. Checks still answer correctly and `DELETE` scoped to `(object, relation, subject)` removes every copy, so a duplicate is hygiene rather than a security problem, but nothing upstream will dedupe for you.
- **Express a grant as delete-then-write.** The domain operation is "give this subject this standing", which is idempotent by intent, and the design already requires delete-then-write for a promotion (adding alone never demotes). Deleting the target standing first makes the write idempotent for free, with no read and no race.
- **Tuple writes are domain side effects, not seed data.** They happen when a contractor is onboarded or an engineer is added, in the same operation as the audit row and the escalation guard ("strictly below your own standing", which OPL cannot express). Nothing should re-run a tuple script on deploy, and there is deliberately no seed script: fixture tuples describe permissions nobody granted, and a reader cannot tell them from real ones.

## TODOs go to GitHub Issues

When you would otherwise write a new `TODO` or `FIXME` in source code, open a GitHub issue in this repo first and leave only a one-line pointer in the file.

**How to file the issue**

- `gh issue create` in `aec-craft/platform-id`. Assignee defaults to the repo owner (`--assignee @me`).
- Labels carry the type (`bug`, `enhancement`, `chore`) and, only when cross-cutting, an area (`security`, `docs`, `dx`, `performance`, `observability`, `accessibility`, `tech-debt`).
- The body should include the source file path and a line number, plus the scope and any context that would otherwise have lived in the code comment.

**How to mark the code**

- One line, comment-style for the language: `// TODO(#123): short reason this exists`, `# TODO(#123): ...`, `<!-- TODO(#123): ... -->`.
- A bare `// TODO:` is acceptable for a known gap that has no issue yet; add the number when one is filed.
- Do not leave multi-line TODO blocks with detailed context; that detail lives in the issue.
- Exception: if the TODO will be resolved within the current PR, use `// FIXME(this-pr): ...` and do not open an issue.
- Bare `#123` only, never `aec-craft/platform-id#123`: a cross-repo form creates a backlink from anywhere it is quoted.

## Code comments

**One to three lines, or none.** A comment carries only what the code cannot: a
constraint from outside (an Ory, GCP, browser or protocol behaviour, named with
its version or config path), a choice against the obvious alternative, or the
symptom when the line is wrong. Configuration is held to the same bar, plus the
unit or budget a number came from. Say it once, next to its cause.

**Delete the rest.** Restating the code, narrating how a bug was found, or
explaining a failure that is now fixed all read as current and cost more than
they give. History belongs to git and the issue tracker; an issue number appears
in code only as a TODO pointer.

```ts
// Both or neither: Hydra refuses `post_logout_redirect_uri` without
// `id_token_hint`, so a missing hint skips the hand-off rather than attempting it.
if (endSession && idToken) {
```

Not this, for the same line:

```ts
// Sign-out looked fine locally because the dev client had no post-logout
// redirect registered. On dev it started answering 400 invalid_request, and
// reading Hydra's source showed it validates the pair together, so we first
// tried sending the redirect alone, then added the hint, and now both are set
// together, which is why this condition has two operands. See PR #53.
if (endSession && idToken) {
```

Both say the same thing. One is two lines and is still true next year.

A comment is part of the line it sits above: change one, change the other, and
delete it when its reason is gone. A stale comment is worse than none, because
it is read as current.

**Two exceptions, and only two.** A file header may take a second short paragraph
where one genuinely covers two constraints, so about six lines is its ceiling; and
a commented-out block in a template or example file is content rather than a
comment, since copying it is the point.

## Naming conventions

### Files

- **Entity-scoped files use dot separators**: `<entity>.<role>.ts(x)` (`login.form.tsx`, `session.schemas.ts`). Not hyphens.
- **Generic, non-entity leaf files use kebab-case**: lib utilities, shadcn primitives, hooks (`safe-callback-url.ts`, `use-mobile.ts`).
- **Singular entity prefixes**: `session.service.ts`, not `sessions.service.ts`.
- **Test files mirror their subject** and use the `.test.ts` suffix (never `.spec.ts`).
- Ory config files keep Ory's expected names (`kratos.yaml`, `identity.schema.json`); a domain-specific exception.

### Discriminators, enums, domain fields

- **Never `kind`, anywhere.** Discriminator keys, type aliases, parameters and locals all use `type` (`FlowType`, not `FlowKind`; `type: "put"`, not `kind: "put"`).
- **State field is `status`** for domain models; `state` is reserved for UI render state (and for the OAuth2/OIDC `state` parameter, which keeps its protocol name).
- **Enum string values are lowercase**; multi-word values are camelCase. Error codes are `UPPER_SNAKE`; permission scopes are colon-segmented (`org:member:delete`).
- **App/TS layer is camelCase**; anything persisted or wire-defined by Ory keeps Ory's casing. Do not "fix" protocol-dictated names (`client_id`, `redirect_uri`).

### Booleans

- **Internal boolean variables and computed predicates take an `is`/`has`/`can` prefix** (`isLoading`, `canDelete`).
- **Keep the library's field name when re-binding**; TanStack Query state stays `isPending`/`isLoading`.
- **Bare adjectives only for props that mirror the DOM/ARIA**: `open`, `disabled`, `checked`. Visibility props use `show*`.

### Functions

- **Verbs**: `create*` (production) / `make*` (test factories), `update*`, `delete*`, `findBy*` (entity lookup), `list` (collections), `get*` (computed/derived/session). Reserve `set*` for React state setters.
- **Event handlers**: `on*` for callback props, `handle*` for local DOM/library handlers, `*Handler` for route-handler factories.
- **No `Async` suffix**; rely on `async`/`Promise` typing.

### Types and symbols

- **No `I` prefix** on interfaces. **Config-bag types are `*Options`** (not `*Opts`). HTTP query-shape types are `*Query`.
- **Acronym casing**: `Id`, `Url`, `Api`, `Http`, `Json`, `Ui`, `OAuth`. Externally dictated names are left as-is.
- **Locals**: `config`, `message`, `ctx`, `options`, `error` (allow `err` only in `catch (err)`); route-handler params are `req`/`res`.
- **Constants**: module-level config/sentinels are `UPPER_SNAKE`.

## UI components

The ID surface consumes `@aec-craft/ui` (the buildOS design system, published to the GitHub registry from `aec-craft/ui`); use its primitives and blocks rather than rebuilding local equivalents. If a block is missing a feature, extend it there and bump the dependency here.
