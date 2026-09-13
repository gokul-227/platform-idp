# Identities, credentials and console access

## Two schemas, one identity pool

| Schema | File | Who |
| --- | --- | --- |
| `default` | `identity.user.schema.json` | everyone |
| `staff` | `identity.staff.schema.json` | operators, and only via the admin API |

`staff` is declared `selfservice_selectable: false`, which Kratos enforces in the
flow itself: `?identity_schema=staff` on a registration flow returns 400. So a
staff identity cannot be created by registering.

Both schemas carry the same traits: `email` plus `name.first` and `name.last`.
Neither maps a `password` credential, because password sign-in is disabled.

Neither schema constrains the address. Who may **sign themselves up** is a
separate question, answered by a gate rather than by the schema: see
[Who may register](#who-may-register) below.

**Sign-in identifiers are unique across every schema.** Creating a second
identity for an address that already exists on the other schema is a 409. This is
the single most important consequence in this document: a person has one account,
never a customer account and a staff account.

## Sign-in methods

| Method | Config | Notes |
| --- | --- | --- |
| Emailed code | `code.passwordless_enabled: true` | the primary first factor |
| Google, Microsoft | `oidc` | see [social-login.md](social-login.md) |
| TOTP | `totp` | second factor, self-enrolled |
| Backup codes | `lookup_secret` | second factor, self-enrolled |
| Password | disabled | no password is ever set |

Registration is open in the sense that anyone may start it. Which addresses
complete it is the gate below. Closing it entirely is
`selfservice.flows.registration.enabled: false`, after which the flow 404s and
identities are created by an operator and handed over with a recovery code.

## Who may register

Self-service registration is limited to `neobim.ai` and `neobim.eu`. **An
operator creating an identity in the console is not bound by this** and may use
any domain, which is the point of the arrangement: a contractor or a customer
contact gets an account when somebody decides they should have one, and nobody
gets one by deciding for themselves.

The rule is an interrupting `web_hook` on the registration flow's `after` chain,
calling `apps/id`'s `/api/internal/registration`. The list is
`REGISTRATION_ALLOWED_DOMAINS`, per environment.

This used to be a `pattern` on `identity.user.schema.json`, and the difference is
the whole reason it moved. Kratos validates traits on **every** flow that carries
them, the admin API included, so the pattern also refused the console — creating
`someone@example.com` as an operator returned a 400 from Kratos and a 500 from the
console. A schema says what an identity may be; it is the wrong place to say who
may create one.

Verified against Kratos v26.2.0, because the alternative is trusting that an
interrupting hook does what it says:

- A 403 from the hook aborts the flow and **no identity is persisted** — there is
  no orphan to clean up.
- The message the hook returns renders against the email field, not as a banner.
- The hook must sit **before** `session` in the `after` chain, or a session is
  issued before the refusal lands.
- The admin API creates on any domain, since the schema no longer objects.

Configure it per method: the `code` and `oidc` chains each carry their own hooks,
so a gate on one does not bind the other. Both are wired in
`kratos.local.example.yml`.

The gate carries no shared secret, unlike this app's audit receiver. That one
writes a row and a forged row is indistinguishable from a real one; this reads
nothing, writes nothing, and answers a question the registration form already
answers out loud when it refuses somebody. A token would also not stop the only
attack that matters, which is forging an allow from between Kratos and the app —
a request header does not sign a response. Reachability is the lever if one is
ever wanted, the same way the Ory admin surfaces are protected.

It still fails closed. If the app is unreachable the hook errors, and
`can_interrupt: true` makes that a refusal rather than a pass.

### Configuring it

Two settings, neither a secret and neither in GitHub. Both live in
`infra/environments/<env>/variables.tf`, so they are per environment:

| | Default | Means |
| --- | --- | --- |
| `registration_open` | `false` | `true` opens registration to anyone and ignores the list. This is the switch prod flips when it opens, and the only change that takes. |
| `registration_allowed_domains` | `neobim.ai`, `neobim.eu` | Who may register while it is closed. |

Only a literal `true` opens it. A variable set to `1` or `yes` leaves it closed,
because this is the direction where being wrong is expensive.

An empty list while closed admits **nobody**, and the app says so in its log. That
is a misconfiguration rather than a way to open registration: reading "no list"
as "no restriction" would turn a missing variable into open sign-ups, which is
the one failure nobody notices. Saying open requires saying it.

There is no copy of the domain list in code — it would be a second answer to
drift from these.

The hook itself is in `ory/kratos/oidc.providers.template.yml`, which despite
its name is the deployed stack's whole second config file — the only
per-environment Kratos config there is, since a hook is a list of objects and
so has no env-var path. `sync-secrets.yml` renders it per environment and
writes it as a new version of `kratos-oidc-providers`, so a change is a
reviewed diff plus one dispatch rather than YAML hand-edited into three
projects. The body it posts, `registration.gate.jsonnet`, is baked into the
Kratos image.

Locally the same block goes in `kratos.local.yml`; see
`kratos.local.example.yml`.

## Console access

Access is a property of an identity, not a separate account. Granting it moves
the identity onto the `staff` schema and writes `metadata_public.staffRole`;
revoking moves it back. The identity keeps its id, its credentials, its sessions
and its history.

`metadata_public`, not `metadata_admin`: the latter is absent from
`/sessions/whoami`, so it cannot gate a session. `metadata_public` is
session-visible and still admin-write-only, so posting it through the settings
flow is ignored.

| Role | May |
| --- | --- |
| `admin` | everything about customer identities and applications |
| `superadmin` | the same, plus granting, changing and revoking console access |

An unrecognised role value grants nothing. The gate fails closed.

### Where

The console, on the identity's own detail page, in the **Console access** card.
It is visible only to superadmins. The identity list shows an Access column, so
operators are visible among users.

### The rules, and why

Enforced in `apps/console/src/lib/staff.ts`, in one place, for every path that
could change access or destroy an operator:

1. **Only superadmins** may change access.
2. **Nobody may change their own.** This is what makes lockout impossible: the
   last superadmin cannot demote or deactivate the only account that could.
3. **The bootstrap staff is untouchable** from the console. That is the address in
   `ROOT_OPERATOR_EMAIL`, the one the bootstrap job grants, so a deployment
   always keeps a way in.
4. **The last active superadmin** cannot lose the role, be deactivated or be
   deleted.

The same rules cover deactivating, deleting, removing credentials and revoking
sessions when the target is an operator. Without that, deleting an operator from
the identity page would route around all four.

Controls that would be refused are not rendered. The server-side guard behind
each one stays, for the page that was already open when something changed; a
refusal then redirects back with a code the page renders, rather than throwing.

This is a console-level guarantee, not a cryptographic one. The Kratos admin API
answers anyone holding Cloud Run invoker on the admin service, and that IAM grant
is the real break-glass path. See [operations.md](operations.md).

## Second factors are self-enrolled

The console requires `aal2`, and Kratos has no admin API for enrolling TOTP. So
an operator below that floor is sent to the step-up flow, which asks for the
code when an authenticator is enrolled and offers enrolment when none is. Either
way the only fix is theirs. The console shows whether a second factor is
enrolled, because otherwise nothing here is visible to an operator granting
access.

## Account linking

Because identifiers are unique, signing in with Google on an address that already
has a code identity cannot create a second account. Kratos offers to **link**
instead: sign in the way you already can, and the provider is added as another
method. The message it renders for this is Kratos's own and reads awkwardly;
Kratos OSS has no mechanism to override its wording, so the fix is a lookup in
our own `FlowMessages` keyed by message id.
