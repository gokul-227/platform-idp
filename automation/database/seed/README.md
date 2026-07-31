# automation/database/seed/

## Retired: the NeoBIM dataset (`seed_enterprise_dataset.py`)

The older "NeoBIM" sample dataset (4 organizations, 38 identities on the
legacy `Organization`/`Team` Keto namespace) has been **retired** — the
script was deleted and its ~37 seeded `@neobim.example` local-dev identities
were removed from the running stack via `console-api`'s real
`DELETE /api/v1/identities/{id}` endpoint (the same one the Identities
console page's own Delete button calls). It is superseded by the `Group`
model dataset below, which is the actively maintained "try it yourself"
sample going forward.

Two identities were deliberately **not** deleted as part of that cleanup:

- `marcus.chen@neobim.example` — the sole identity holding the real
  `Organization:platform#admin` Keto tuple, which is what
  `identity-ui/middleware.ts`'s `/console` gate and the Oathkeeper
  `console-relation-tuples-rule` both check. Deleting it would have left
  **no identity on the whole stack** able to reach the Admin Portal — the
  `Group` model (used by the dataset below) doesn't grant this legacy
  relation, so it isn't a substitute yet (see
  `docs/09-architecture/README.md`'s "Group authorization model" section,
  "Documented conflict, not silently resolved"). It's kept around
  specifically as the platform's one working admin-console access identity.
- `qa.verify.<timestamp>@neobim.example` — an unrelated ad hoc identity
  that happens to share the `@neobim.example` domain but has no
  `seed_dataset` metadata tag and isn't in `seed_enterprise_dataset.py`'s
  `USERS` list; left untouched since it wasn't created by that script.

Keto tuples that referenced the deleted identities (`Organization`/`Team`
relations) were **not** individually hunted down and removed — Keto doesn't
cascade-delete on identity removal, so those tuples are now orphaned
references pointing at identity IDs that no longer exist. This is a
harmless, accepted side effect of this cleanup (an orphaned ReBAC tuple that
can never resolve `check()` true again for a real subject), not a Keto
orphan-tuple management project.

`seed_result.json` (the old dataset's result manifest) was deleted along
with the script, since it described data that no longer exists.

---

## `seed_group_model_dataset.py` — the `Group` permit model dataset ("Sparc Engineering")

A second, ADDITIVE dataset (`seed_group_model_dataset.py`), reusing the exact
same real-API conventions as `seed_enterprise_dataset.py`, but exercising the
new `Group` namespace/permit hierarchy (`docs/09-architecture/README.md`'s
"Group authorization model" section; implemented in
`platform/authorization-service/src/authorization_service/group_authz.py`)
instead of the old Organization/Team model. It is literally the worked
example from `authz-architecture.html`'s Plates 3/4 — a small engineering
firm running one project with three contractors — reused here as living,
runnable documentation of the permit hierarchy: `read` granted explicitly via
`viewers` (never traverses the tree), `write`/`manage`/`admin` falling
through the standing ladder (`owners > managers > editors > viewers`) AND
traversing the `parent` tree.

### What it creates

- **6 groups**, with a real `parent` hierarchy (all Keto `Group`-namespace
  tuples, not a separate CRUD entity — Group has no tenant-service record):
  - `sparc` ("Sparc Engineering") — org root, no parent.
  - `nbu-clinic` ("NorthBuild Clinic") — parent `sparc`.
  - `acme-mep` ("Acme MEP") — parent `nbu-clinic`.
  - `stahlbau-huber` ("Stahlbau Huber") — parent `nbu-clinic`.
  - `schmidt-architekten` ("Schmidt Architekten") — parent `nbu-clinic`.
  - `acme-mep-controls` ("Acme MEP — Controls Package") — parent `acme-mep`.
    Added to demonstrate 3-level parent traversal (`sparc` → `nbu-clinic` →
    `acme-mep` → `acme-mep-controls`) beyond the original 2-level tree,
    matching `authz-architecture.html`'s "Split Acme into packages"
    operation.
- **10 identities** (real Kratos identities, `@sparc-engineering.example`,
  force-verified) with real Group standings:
  - Marius Albrecht — CEO/org principal — `sparc#owners`.
  - Lena Brandt — junior staff — `sparc#viewers`.
  - Paul Vogel — project manager — `nbu-clinic#managers`.
  - Jonas Weber — Acme MEP lead — `acme-mep#managers`.
  - Timo Bauer — Acme MEP junior — `acme-mep#viewers`.
  - Sebastian Huber — Stahlbau Huber principal — `stahlbau-huber#editors`.
  - Katrin Schmidt — Schmidt Architekten principal —
    `schmidt-architekten#editors`.
  - Sabine Richter — Acme MEP senior engineer — `acme-mep#editors` (a
    second Acme MEP editor, alongside Weber's manager standing there).
  - Frida Berger — NorthBuild Clinic owner's representative / client
    reviewer — `nbu-clinic#viewers` (direct project-level read-only
    standing, same shape as Lena's org-level read-only account but scoped
    one level down).
  - Niklas Vogt — Acme MEP Controls package lead — `acme-mep-controls#managers`
    (the new 3-level-deep group).
- **16 "roster" viewer tuples** (`subject_set`, e.g.
  `Group:nbu-clinic#viewers@(Group:acme-mep#viewers)`) joining each
  contractor's whole standing ladder — and the org's — onto the project's
  viewers, so read resolves correctly for everyone per the design doc's
  "Onboard a contractor" operation. `acme-mep-controls` gets its own 3-tuple
  roster join (managers/editors/viewers) onto `nbu-clinic#viewers`, since a
  `parent` tuple only makes write/manage/admin traverse *upward* — a
  package's own manager gains nothing on `nbu-clinic` itself without this
  explicit join.
- Every identity's password is `SparcEngineering2026!Secure` — a different,
  clearly-labeled credential from the (now-retired) NeoBIM dataset's, so the
  two seed runs are never confused for one another.

### Three real write paths, used deliberately

1. **Keto's raw admin API** (`PUT http://keto:4467/admin/relation-tuples`)
   — for the 4 `parent` tuples (plain `subject_id` pointers; the
   authorization-service grant endpoints don't handle `parent`), and for the
   one unavoidable bootstrap tuple, `sparc#owners@<Marius>` — there is, by
   definition, no existing owner to grant it through the delegation-guarded
   endpoint the very first time.
2. **`authorization-service`'s real `POST /api/v1/groups/{id}/grants`**
   (delegation-guarded) — for every other person's standing. Each grant was
   picked so the *granter* already holds sufficient standing under
   `group_authz.py`'s real traversal rules (verified live, not asserted):
   Marius (owner of `sparc`, which resolves to `admin` on every descendant
   group via parent traversal) grants Lena `sparc#viewers`, Vogel
   `nbu-clinic#managers`, and Weber `acme-mep#managers`; Weber (now a real
   `acme-mep` manager) grants Bauer `acme-mep#viewers` and Richter
   `acme-mep#editors`; Vogel (whose own standing rank on the contractor
   groups below `nbu-clinic` is `managers`, via `nbu-clinic`'s manage-permit
   parent traversal) grants Huber and Schmidt `editors` on their respective
   groups, and grants Berger `viewers` directly on `nbu-clinic` itself — one
   rank below his own, the maximum a manager may hand out. Marius also
   grants Vogt `managers` on the new `acme-mep-controls` group: Weber
   *couldn't* have made that grant himself — his own effective standing rank
   on the new child group is also `managers` (rank 3, via `acme-mep`'s
   manage permit traversing down to it), and a rank-3 granter can never
   grant another rank-3 standing, the same rule that stops him granting a
   second `acme-mep` manager directly.
3. **`console-api`'s existing `POST /api/v1/relation-tuples`** — for the 16
   `subject_set` roster tuples, since neither the grants endpoint nor a
   `parent` pointer can express a subject_set target; console-api forwards
   any namespace (including `Group`) to Keto unmodified and already supports
   `subject_set` bodies.

### Idempotency

Every Group tuple write is preceded by a real `GET` against Keto's read API
(`http://keto:4466/relation-tuples`) checking whether that exact tuple
already exists — mirrored from the existing script's "check tenant-service
by name first" pattern, adapted since `Group` has no separate named entity to
check (the tuple itself is the existence check). Identity creation is
409-tolerant like the (now-retired) NeoBIM script, with one addition: since
`console-api` has no identity-lookup-by-email endpoint, a 409 falls back to a
real lookup against Kratos's own admin API (`GET
/admin/identities?credentials_identifier=<email>`) so downstream tuple
writes still resolve a real identity id even on a rerun.
**Confirmed live**: after the dataset was expanded from 7 to 10 people (and
5 to 6 groups), re-running the script against the already-seeded 7/5
reported `identity already exists` / `parent tuple exists` / `standing
tuple exists` / `grant already applied` / `roster tuple exists` for every
one of the original entities, while creating exactly the 3 new identities,
1 new group's `parent` tuple, 3 new grants, and 3 new roster tuples — zero
duplicate writes, `10/10 identities resolved` in the final run summary.

### Running it

```bash
docker run --rm --network compose_default \
  -v "$(pwd)/automation/database/seed:/scratch" python:3.13-slim \
  sh -c "pip install -q httpx && python /scratch/seed_group_model_dataset.py"
```

A result manifest (group hierarchy + identity ids) is written to
`seed_group_result.json` in this same directory after each run.

### Verifying the group hierarchy live

```bash
# Real permit check via authorization-service — 200 + {"allowed":true} or
# 403 + {"allowed":false}, exactly matching Keto's own check() contract.
curl -s -X POST http://localhost:8090/api/v1/groups/acme-mep/authorize \
  -H 'Content-Type: application/json' \
  -d '{"subject_id": "<marius-id>", "permit": "admin"}'
# -> 200 {"allowed": true}  (owner of sparc, traverses down through nbu-clinic to acme-mep)

curl -s -X POST http://localhost:8090/api/v1/groups/acme-mep/authorize \
  -H 'Content-Type: application/json' \
  -d '{"subject_id": "<bauer-id>", "permit": "write"}'
# -> 403 {"allowed": false}  (Bauer only holds acme-mep#viewers)
```

Verified live end-to-end against the running stack for all 10 identities
across the 6 groups — the complete Plate 3/4 matrix from
`authz-architecture.html` resolves exactly as designed, extended with the
new `acme-mep-controls` sub-package:

```bash
# Richter (acme-mep#editors, new) — write on acme-mep -> {"allowed": true}
# Richter — manage on acme-mep -> {"allowed": false} (editor, no manage)
# Berger (nbu-clinic#viewers, new) — read on nbu-clinic -> {"allowed": true}
# Berger — write on nbu-clinic -> {"allowed": false} (viewer only)
# Vogt (acme-mep-controls#managers, new) — manage on acme-mep-controls -> {"allowed": true}
# Vogt — manage on acme-mep (the parent — does NOT traverse upward) -> {"allowed": false}
# Vogt — read on nbu-clinic, 3 hops up via the new roster join -> {"allowed": true}

# Re-checked, unaffected by the expansion:
# Weber — write on nbu-clinic -> {"allowed": false}  (still doesn't leak sideways/up)
# Bauer — read on nbu-clinic -> {"allowed": true}     (roster join still resolves)

# Expected NEW result from the expansion (not a regression):
# Marius — admin on the brand-new acme-mep-controls -> {"allowed": true}
#   (an owner's admin permit traverses every descendant, including one that
#   didn't exist before this pass)
```

All 7 identities from the original dataset still read `nbu-clinic` (via
direct standing or the roster subject_set indirection), each contractor
lead (Weber/Huber/Schmidt/Richter) writes only their own group and nothing
else, Vogel and Marius write/manage everything at and below their own
group, and Marius alone holds `admin` across the whole tree — now including
the new `acme-mep-controls` group — via `sparc#owners`' parent-tree
traversal.

### Applications

No new fake OAuth2 client was registered for this dataset — see
`integrations/applications/*.yaml` for real, already-running applications
that could plausibly stand in for "Sparc Engineering"'s tools without
inventing an untestable placeholder (e.g. `streamlit-enterprise-portal` or
`flask-identity-viewer` as a stand-in project portal, `buildos` as a
stand-in BIM/project-graph consumer). None were modified for this dataset.
