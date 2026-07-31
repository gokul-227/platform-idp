"""Seeds a second, ADDITIVE sample dataset — this one exercising the new
`Group` namespace/permit model (`authz-architecture.html`'s "Keto access
design for the federated model", implemented in
`platform/authorization-service/src/authorization_service/group_authz.py`)
— using the exact same real-API-calling conventions as
`seed_enterprise_dataset.py` (the NeoBIM dataset): console-api for
identities, force-verify emails, 409-tolerant identity creation, a result
manifest written at the end. Nothing here touches the old Organization/Team
model or the NeoBIM dataset.

This is the design doc's own worked example (Plates 3/4): a small
engineering firm ("Sparc Engineering") running one project ("NorthBuild
Clinic") with three contractors, reused here as living documentation of the
Group permit hierarchy — read granted explicitly via `viewers` (never
traverses), write/manage/admin falling through the standing ladder AND
traversing the `parent` tree.

Three real write paths are used, deliberately, to exercise all of them:
  1. Keto's raw admin API (`PUT http://keto:4467/admin/relation-tuples`) —
     for `parent` tuples (plain subject_id pointers; the authorization-service
     grant endpoints don't handle `parent` at all) and for the one
     unavoidable bootstrap tuple (Marius's own `sparc#owners` — there is by
     definition no existing owner to grant it through the delegation-guarded
     endpoint the very first time).
  2. `authorization-service`'s real, delegation-guarded
     `POST /api/v1/groups/{id}/grants` — for every other person's standing
     (owners/managers/editors/viewers), each granted by someone who already
     holds sufficient standing (verified against `group_authz.py`'s actual
     traversal rules — see the comments beside each call below). This is the
     real, tested `assert_can_grant` guard, not a bypass.
  3. `console-api`'s existing `POST /api/v1/relation-tuples` — for the
     "roster" viewers tuples (`subject_set`-shaped, e.g.
     `Group:nbu-clinic#viewers@(Group:acme-mep#viewers)`), since neither the
     grants endpoint nor Keto's `parent` pointer shape can express a
     subject_set target; console-api's endpoint forwards any namespace
     (including `Group`) to Keto unmodified and already supports
     `subject_set` bodies (used elsewhere for Organization/Team tuples).

Idempotent by construction: every Group tuple write is preceded by a real
GET against Keto's read API (`http://keto:4466/relation-tuples`) checking
whether that exact tuple already exists, mirroring the existing script's
"check before create" pattern for organizations (which checks tenant-service
by name) — Group has no separate CRUD entity to check by name, so the tuple
itself is the existence check.

Run inside the compose network, e.g.:
  docker run --rm --network compose_default -v <this dir>:/scratch python:3.13-slim \
    sh -c "pip install -q httpx && python /scratch/seed_group_model_dataset.py"
"""

import json
import sys

import httpx

CONSOLE_API = "http://console-api:8086"
AUTHZ_SERVICE = "http://authorization-service:8090"
KETO_READ = "http://keto:4466"
KETO_ADMIN = "http://keto:4467"
KRATOS_ADMIN = "http://kratos:4434"

client = httpx.Client(timeout=15)

DEFAULT_PASSWORD = "SparcEngineering2026!Secure"
DOMAIN = "sparc-engineering.example"

# (first, last, job_title, is_platform_admin)
PEOPLE = [
    ("Marius", "Albrecht", "Chief Executive Officer / Org Principal"),
    ("Lena", "Brandt", "Junior Staff Engineer"),
    ("Paul", "Vogel", "Project Manager, NorthBuild Clinic"),
    ("Jonas", "Weber", "Acme MEP — Lead Engineer"),
    ("Timo", "Bauer", "Acme MEP — Junior Engineer"),
    ("Sebastian", "Huber", "Stahlbau Huber — Principal"),
    ("Katrin", "Schmidt", "Schmidt Architekten — Principal"),
    # Added to bring the dataset to ~10 people (see README for rationale):
    ("Sabine", "Richter", "Acme MEP — Senior Engineer"),
    ("Frida", "Berger", "NorthBuild Clinic — Owner's Representative (Client Reviewer)"),
    ("Niklas", "Vogt", "Acme MEP Controls — Package Lead"),
]

# group_id -> (display name, parent_id or None)
GROUPS = {
    "sparc": ("Sparc Engineering", None),
    "nbu-clinic": ("NorthBuild Clinic", "sparc"),
    "acme-mep": ("Acme MEP", "nbu-clinic"),
    "stahlbau-huber": ("Stahlbau Huber", "nbu-clinic"),
    "schmidt-architekten": ("Schmidt Architekten", "nbu-clinic"),
    # Added: a real sub-package under Acme MEP, demonstrating 3-level parent
    # traversal (sparc -> nbu-clinic -> acme-mep -> acme-mep-controls),
    # matching authz-architecture.html's "Split Acme into packages" operation.
    "acme-mep-controls": ("Acme MEP — Controls Package", "acme-mep"),
}


def slugify(first: str, last: str) -> str:
    return f"{first.lower()}.{last.lower()}"


def tuple_exists(namespace: str, object_id: str, relation: str, subject_id: str | None = None,
                  subject_set: dict | None = None) -> bool:
    """Idempotency check against Keto's own read API before writing."""
    resp = client.get(
        f"{KETO_READ}/relation-tuples",
        params={"namespace": namespace, "object": object_id, "relation": relation},
    )
    if resp.status_code != 200:
        return False
    for t in resp.json().get("relation_tuples", []):
        if subject_id is not None and t.get("subject_id") == subject_id:
            return True
        if subject_set is not None:
            ss = t.get("subject_set") or {}
            if (
                ss.get("namespace") == subject_set["namespace"]
                and ss.get("object") == subject_set["object"]
                and ss.get("relation") == subject_set["relation"]
            ):
                return True
    return False


def write_parent_tuple(child: str, parent: str) -> None:
    """Direct Keto admin API write — plain subject_id pointer, per this
    repo's documented convention that `parent` is never a subject_set."""
    if tuple_exists("Group", child, "parent", subject_id=parent):
        print(f"  parent tuple exists: {child}#parent@{parent}")
        return
    resp = client.put(
        f"{KETO_ADMIN}/admin/relation-tuples",
        json={"namespace": "Group", "object": child, "relation": "parent", "subject_id": parent},
    )
    if resp.status_code not in (200, 201):
        print(f"  FAILED parent tuple {child}#parent@{parent}: {resp.status_code} {resp.text}", file=sys.stderr)
        return
    print(f"  wrote parent tuple: {child}#parent@{parent}")


def bootstrap_standing(group_id: str, relation: str, subject_id: str) -> None:
    """Direct Keto admin API write, used ONLY for Marius's initial
    sparc#owners tuple — there is no existing owner to grant it through the
    delegation-guarded endpoint the first time."""
    if tuple_exists("Group", group_id, relation, subject_id=subject_id):
        print(f"  standing tuple exists: {group_id}#{relation}@{subject_id}")
        return
    resp = client.put(
        f"{KETO_ADMIN}/admin/relation-tuples",
        json={"namespace": "Group", "object": group_id, "relation": relation, "subject_id": subject_id},
    )
    if resp.status_code not in (200, 201):
        print(f"  FAILED bootstrap {group_id}#{relation}@{subject_id}: {resp.status_code} {resp.text}", file=sys.stderr)
        return
    print(f"  bootstrapped standing: {group_id}#{relation}@{subject_id}")


def grant_standing(group_id: str, granter_id: str, target_id: str, relation: str) -> None:
    """Real, delegation-guarded write via authorization-service's
    POST /api/v1/groups/{id}/grants — exercises the actual assert_can_grant
    guard, not a bypass."""
    if tuple_exists("Group", group_id, relation, subject_id=target_id):
        print(f"  grant already applied: {group_id}#{relation}@{target_id}")
        return
    resp = client.post(
        f"{AUTHZ_SERVICE}/api/v1/groups/{group_id}/grants",
        json={"granter_subject_id": granter_id, "target_subject_id": target_id, "relation": relation},
    )
    if resp.status_code != 201:
        print(f"  FAILED grant {group_id}#{relation}@{target_id} (granter={granter_id}): "
              f"{resp.status_code} {resp.text}", file=sys.stderr)
        return
    print(f"  granted via authorization-service: {group_id}#{relation}@{target_id} (granter={granter_id})")


def write_roster_viewer_tuple(project_group: str, source_group: str, source_relation: str) -> None:
    """Subject_set roster join, e.g. Group:nbu-clinic#viewers@(Group:acme-mep#viewers),
    via console-api's existing /api/v1/relation-tuples (the only real write
    path here that accepts a subject_set body for this namespace)."""
    subject_set = {"namespace": "Group", "object": source_group, "relation": source_relation}
    if tuple_exists("Group", project_group, "viewers", subject_set=subject_set):
        print(f"  roster tuple exists: {project_group}#viewers@({source_group}#{source_relation})")
        return
    resp = client.post(
        f"{CONSOLE_API}/api/v1/relation-tuples",
        json={"namespace": "Group", "object": project_group, "relation": "viewers", "subject_set": subject_set},
    )
    if resp.status_code != 201:
        print(f"  FAILED roster tuple {project_group}#viewers@({source_group}#{source_relation}): "
              f"{resp.status_code} {resp.text}", file=sys.stderr)
        return
    print(f"  wrote roster tuple: {project_group}#viewers@({source_group}#{source_relation})")


def main() -> None:
    print(f"Seeding {len(GROUPS)} groups, {len(PEOPLE)} identities (Group permit model dataset)...")

    # 1. Identities (real Kratos identities via console-api, force-verified)
    ids: dict[str, str] = {}
    for first, last, job_title in PEOPLE:
        email = f"{slugify(first, last)}@{DOMAIN}"
        traits = {
            "email": email,
            "name": {"first": first, "last": last},
            "locale": "en",
            "timezone": "Europe/Berlin",
            "status": "active",
            "metadata": {"job_title": job_title, "seed_dataset": "sparc-group-model-v1"},
        }
        resp = client.post(
            f"{CONSOLE_API}/api/v1/identities",
            json={"email": email, "password": DEFAULT_PASSWORD, "traits": traits},
        )
        if resp.status_code not in (200, 201):
            if resp.status_code == 409:
                print(f"  identity already exists: {email}")
            else:
                print(f"  FAILED to create identity {email}: {resp.status_code} {resp.text}", file=sys.stderr)
            # console-api has no identity list/lookup-by-email endpoint, so
            # fall back to Kratos's own admin API directly (real, no
            # fabricated id) to still resolve downstream tuple writes.
            lookup = client.get(
                f"{KRATOS_ADMIN}/admin/identities", params={"credentials_identifier": email}
            )
            found = None
            if lookup.status_code == 200:
                for item in lookup.json() or []:
                    if item.get("traits", {}).get("email") == email:
                        found = item.get("id")
                        break
            if not found:
                print(f"  could not resolve existing identity id for {email}, skipping", file=sys.stderr)
                continue
            ids[f"{first} {last}"] = found
            continue

        identity_id = resp.json().get("id") or resp.json().get("identity", {}).get("id")
        print(f"  created identity: {email} -> {identity_id}")
        client.post(f"{CONSOLE_API}/api/v1/identities/{identity_id}/force-verify")
        ids[f"{first} {last}"] = identity_id

    marius = ids.get("Marius Albrecht")
    lena = ids.get("Lena Brandt")
    vogel = ids.get("Paul Vogel")
    weber = ids.get("Jonas Weber")
    bauer = ids.get("Timo Bauer")
    huber = ids.get("Sebastian Huber")
    schmidt = ids.get("Katrin Schmidt")
    richter = ids.get("Sabine Richter")
    berger = ids.get("Frida Berger")
    vogt = ids.get("Niklas Vogt")

    if not all([marius, lena, vogel, weber, bauer, huber, schmidt, richter, berger, vogt]):
        print("FATAL: not all identities resolved, aborting tuple writes.", file=sys.stderr)
        with open("/scratch/seed_group_result.json", "w") as f:
            json.dump({"groups": GROUPS, "identities": ids, "error": "incomplete identity set"}, f, indent=2)
        sys.exit(1)

    # 2. Parent hierarchy (direct Keto admin API — plain subject_id pointers)
    print("\nWriting parent hierarchy...")
    for group_id, (_, parent) in GROUPS.items():
        if parent:
            write_parent_tuple(group_id, parent)

    # 3. Bootstrap: Marius's sparc#owners — no existing owner to grant it
    #    through the delegation-guarded endpoint the first time.
    print("\nBootstrapping org root owner...")
    bootstrap_standing("sparc", "owners", marius)

    # 4. Delegation-guarded grants via authorization-service, each verified
    #    against group_authz.py's real traversal rules:
    print("\nGranting standings via authorization-service (delegation-guarded)...")

    # Marius (sparc#owners, rank 4 = admin permit everywhere below sparc via
    # parent traversal) grants Lena viewers on sparc directly (1 < 4, allowed).
    grant_standing("sparc", granter_id=marius, target_id=lena, relation="viewers")

    # Marius has admin on nbu-clinic (traverses up to sparc's owners), so he
    # can grant Vogel managers there (3 < 4, allowed).
    grant_standing("nbu-clinic", granter_id=marius, target_id=vogel, relation="managers")

    # Marius has admin on acme-mep too (same traversal, one hop further), so
    # he grants Weber managers on acme-mep (3 < 4). Vogel himself could only
    # grant up to editors here (his own standing rank on acme-mep is
    # "managers" via nbu-clinic's manage-permit parent traversal, and a
    # manager may not grant another manager) — using Marius for this one
    # is deliberate, not incidental.
    grant_standing("acme-mep", granter_id=marius, target_id=weber, relation="managers")

    # Weber (acme-mep#managers, rank 3 on acme-mep) grants Bauer viewers
    # there (1 < 3, allowed) — a real contractor-lead self-onboarding grant.
    grant_standing("acme-mep", granter_id=weber, target_id=bauer, relation="viewers")

    # Vogel's own standing rank on the contractor groups below nbu-clinic is
    # "managers" (via nbu-clinic's manage-permit parent traversal), so he may
    # grant up to (but not including) managers — editors is allowed (2 < 3).
    grant_standing("stahlbau-huber", granter_id=vogel, target_id=huber, relation="editors")
    grant_standing("schmidt-architekten", granter_id=vogel, target_id=schmidt, relation="editors")

    # Weber (acme-mep#managers, rank 3 on acme-mep) grants Richter editors
    # there too (2 < 3, allowed) — a second Acme MEP engineer, same shape as
    # the existing Huber/Schmidt editors.
    grant_standing("acme-mep", granter_id=weber, target_id=richter, relation="editors")

    # Vogel (nbu-clinic#managers, rank 3 on nbu-clinic itself) grants Berger
    # viewers directly on nbu-clinic (1 < 3, allowed) — a client-side
    # reviewer with no write anywhere, same shape as Lena's read-only account
    # but scoped to the project rather than the whole org.
    grant_standing("nbu-clinic", granter_id=vogel, target_id=berger, relation="viewers")

    # Marius (sparc#owners, admin permit on every descendant via parent
    # traversal, including the brand-new acme-mep-controls) grants Vogt
    # managers on acme-mep-controls (3 < 4, allowed). Weber could NOT have
    # made this grant himself: his own effective standing rank on
    # acme-mep-controls is "managers" (rank 3, via acme-mep's manage permit
    # traversing down to its new child) — granting "managers" requires a
    # STRICTLY higher rank than the target, so a rank-3 granter can never
    # grant rank 3 (same rule that stops Weber granting another acme-mep
    # manager). Using Marius here is deliberate, mirroring exactly why
    # Marius (not Vogel) grants Weber's own acme-mep#managers above.
    grant_standing("acme-mep-controls", granter_id=marius, target_id=vogt, relation="managers")

    # 5. Roster viewers — join each contractor's whole standing ladder (or
    #    the org's, for the project itself) onto nbu-clinic's viewers, so
    #    read flows correctly per the design doc's "Onboard a contractor"
    #    operation. Subject_set tuples, written via console-api.
    print("\nWriting roster viewer tuples (subject_set)...")
    write_roster_viewer_tuple("nbu-clinic", "sparc", "owners")
    write_roster_viewer_tuple("nbu-clinic", "sparc", "managers")
    write_roster_viewer_tuple("nbu-clinic", "sparc", "editors")
    write_roster_viewer_tuple("nbu-clinic", "sparc", "viewers")

    for contractor in ("acme-mep", "stahlbau-huber", "schmidt-architekten"):
        write_roster_viewer_tuple("nbu-clinic", contractor, "managers")
        write_roster_viewer_tuple("nbu-clinic", contractor, "editors")
        write_roster_viewer_tuple("nbu-clinic", contractor, "viewers")

    # acme-mep-controls is a child of acme-mep, not of nbu-clinic directly,
    # so its ladder needs its own explicit roster join onto nbu-clinic's
    # viewers — the parent tuple only makes write/manage/admin traverse
    # UPWARD (a package's manager gains nothing on nbu-clinic itself without
    # this), matching the same "onboard a contractor" pattern used above.
    write_roster_viewer_tuple("nbu-clinic", "acme-mep-controls", "managers")
    write_roster_viewer_tuple("nbu-clinic", "acme-mep-controls", "editors")
    write_roster_viewer_tuple("nbu-clinic", "acme-mep-controls", "viewers")

    print(f"\nDone. {len(ids)}/{len(PEOPLE)} identities resolved.")
    with open("/scratch/seed_group_result.json", "w") as f:
        json.dump({"groups": GROUPS, "identities": ids}, f, indent=2)


if __name__ == "__main__":
    main()
