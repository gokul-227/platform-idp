"""Group-based ReBAC permit hierarchy and delegation guard, implementing
authz-architecture.html ("Keto access design for the federated model").

Keto v0.12's config (ory/keto/config/keto.yaml) declares bare namespaces
only — no relations, no permits, no traversal (its OPL-compiled userset
rewrite feature was never wired for this deployment; see
ory/keto/namespaces/namespaces.ts's header). So the four `Group` relations
(owners/managers/editors/viewers — a subject's "standing") are real Keto
relation tuples, checked via Keto's own `/relation-tuples/check` (which
correctly resolves subject_set indirection, e.g. a project's viewers
containing a contractor's whole managers set), but the four PERMITS
(read/write/manage/admin) and the parent-tree traversal that write/manage/
admin fall through are computed here, by walking real tuples.

Standing ladder: owners > managers > editors > viewers. A subject may only
grant a relation strictly below their own standing on that group (or
below whatever ancestor group actually granted their standing, since
manage/admin also traverse up).
"""

from __future__ import annotations

from authorization_service.keto_client import KetoReadClient

STANDING_RANK: dict[str, int] = {
    "viewers": 1,
    "editors": 2,
    "managers": 3,
    "owners": 4,
}

# read is not a standing you hold directly for grant purposes — it's what
# `viewers` (or anything above it) resolves to. Grantable relations are
# exactly the four standings.
GRANTABLE_RELATIONS = tuple(STANDING_RANK)


class UnknownRelationError(ValueError):
    def __init__(self, relation: str) -> None:
        super().__init__(
            f"Unknown Group relation {relation!r} — must be one of {GRANTABLE_RELATIONS}"
        )
        self.relation = relation


class InsufficientStandingError(Exception):
    """Raised when a subject tries to grant/revoke a relation at or above
    their own standing, or has no standing (not even a manager) on the
    target group at all — see Plate 2's "you may only grant strictly below
    your own standing" rule.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)


async def _parent_id(keto_read: KetoReadClient, group_id: str) -> str | None:
    """A group's direct parent, if any. Written as a plain
    `Group:<child>#parent@<parent_id>` tuple (subject_id is the literal
    parent group id, not a subject_set — there's nothing to expand, `parent`
    is a pointer, not a grantable standing)."""
    tuples = await keto_read.list_relation_tuples("Group", relation="parent", object_id=group_id)
    for tuple_ in tuples:
        if tuple_.subject_id:
            return tuple_.subject_id
    return None


async def _holds_relation(
    keto_read: KetoReadClient, group_id: str, relation: str, subject_id: str
) -> bool:
    """Real Keto check — correctly resolves subject_set indirection (e.g.
    `Group:nbu-clinic#viewers@(Group:acme-mep#managers)`), unlike a manual
    tuple-list scan.
    """
    return await keto_read.check("Group", group_id, relation, subject_id)


async def check_group_permit(
    keto_read: KetoReadClient, group_id: str, permit: str, subject_id: str
) -> bool:
    """Compute one of the four permits (read/write/manage/admin) for
    `subject_id` on `group_id`, exactly matching authz-architecture.html's
    Plate 1 pseudocode: write/manage/admin fall through the ladder AND
    traverse to the parent; read is granted explicitly via `viewers` (or
    anything that implies write) and never traverses.
    """
    if permit == "read":
        if await _holds_relation(keto_read, group_id, "viewers", subject_id):
            return True
        return await check_group_permit(keto_read, group_id, "write", subject_id)

    if permit == "write":
        if await _holds_relation(keto_read, group_id, "editors", subject_id):
            return True
        if await check_group_permit(keto_read, group_id, "manage", subject_id):
            return True
        parent_id = await _parent_id(keto_read, group_id)
        if parent_id:
            return await check_group_permit(keto_read, parent_id, "write", subject_id)
        return False

    if permit == "manage":
        if await _holds_relation(keto_read, group_id, "managers", subject_id):
            return True
        if await check_group_permit(keto_read, group_id, "admin", subject_id):
            return True
        parent_id = await _parent_id(keto_read, group_id)
        if parent_id:
            return await check_group_permit(keto_read, parent_id, "manage", subject_id)
        return False

    if permit == "admin":
        if await _holds_relation(keto_read, group_id, "owners", subject_id):
            return True
        parent_id = await _parent_id(keto_read, group_id)
        if parent_id:
            return await check_group_permit(keto_read, parent_id, "admin", subject_id)
        return False

    raise ValueError(f"Unknown permit {permit!r} — must be one of read, write, manage, admin")


async def own_standing_rank(keto_read: KetoReadClient, group_id: str, subject_id: str) -> int:
    """The highest standing `subject_id` effectively holds on `group_id`,
    INCLUDING what traverses down from an ancestor group (a manager of the
    org is also, functionally, a manager of every project beneath it — see
    Plate 3/4: Marius and Vogel are identical on every body of work). Returns
    0 if the subject holds no standing at all (not even viewers).

    This intentionally reuses the same permit computation as
    `check_group_permit`, since "do you hold at least X standing here" and
    "does the write/manage/admin permit resolve true" are the same
    traversal — only the highest relation's own literal check (not implied
    by falling through) differs from a plain permit lookup, which is why
    this walks the ladder top-down rather than calling `check_group_permit`
    with "read" (read does not imply a standing — a project's whole
    open-read roster are not all "viewers standing" holders for grant
    purposes beyond being viewers themselves).
    """
    if await check_group_permit(keto_read, group_id, "admin", subject_id):
        return STANDING_RANK["owners"]
    if await check_group_permit(keto_read, group_id, "manage", subject_id):
        return STANDING_RANK["managers"]
    if await check_group_permit(keto_read, group_id, "write", subject_id):
        return STANDING_RANK["editors"]
    if await _holds_relation(keto_read, group_id, "viewers", subject_id):
        return STANDING_RANK["viewers"]
    return 0


async def assert_can_grant(
    keto_read: KetoReadClient,
    group_id: str,
    granter_subject_id: str,
    target_relation: str,
) -> None:
    """Enforce "grant strictly below your own standing" (Plate 2). Raises
    `InsufficientStandingError` if the granter may not perform this grant/
    revoke, `UnknownRelationError` if `target_relation` isn't a real
    standing. Only `managers` and above may grant anything at all — an
    editor or viewer has no `manage` permit, so their own rank check (below
    the target's rank) can never pass for any real target relation, but we
    check it explicitly for a clearer error message.

    Owners are a deliberate EXCEPTION to "strictly below": Plate 2's ladder
    lists owners' own admin column as "grants any standing", and the
    original delegation-rules spec is explicit — "Owner can grant Owner,
    Manager, Editor, Viewer" — so an owner may mint another owner (there is
    nothing above owner for "strictly below" to bite against; the ceiling
    is the point, not a loophole). Every rank below owner (managers) is
    held to the strict "target rank < your rank" rule with no such
    exception, matching "Manager cannot grant Manager or Owner" exactly.
    """
    if target_relation not in STANDING_RANK:
        raise UnknownRelationError(target_relation)

    granter_rank = await own_standing_rank(keto_read, group_id, granter_subject_id)
    if granter_rank < STANDING_RANK["managers"]:
        raise InsufficientStandingError(
            f"{granter_subject_id} has no manage permit on {group_id} — "
            "only managers and above may grant or revoke standing"
        )

    target_rank = STANDING_RANK[target_relation]
    is_owner_granting_owner = (
        granter_rank == STANDING_RANK["owners"] and target_rank == STANDING_RANK["owners"]
    )
    if target_rank >= granter_rank and not is_owner_granting_owner:
        raise InsufficientStandingError(
            f"{granter_subject_id} (standing rank {granter_rank} on {group_id}) may not grant "
            f"{target_relation!r} (rank {target_rank}) — only strictly lower standings than "
            "your own may be granted"
        )
