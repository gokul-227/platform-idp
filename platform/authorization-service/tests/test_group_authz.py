from __future__ import annotations

import pytest

from authorization_service.group_authz import (
    STANDING_RANK,
    InsufficientStandingError,
    UnknownRelationError,
    assert_can_grant,
    check_group_permit,
    own_standing_rank,
)
from authorization_service.keto_client import KetoReadClient, RelationTuple


class FakeKetoReadClient(KetoReadClient):
    """Minimal in-memory Keto read client — enough to exercise the real
    traversal/ladder logic in group_authz.py without a running Keto."""

    def __init__(self) -> None:
        self.tuples: list[RelationTuple] = []

    def grant(self, group_id: str, relation: str, subject_id: str) -> None:
        self.tuples.append(RelationTuple("Group", group_id, relation, subject_id=subject_id))

    def set_parent(self, child_id: str, parent_id: str) -> None:
        self.tuples.append(RelationTuple("Group", child_id, "parent", subject_id=parent_id))

    async def list_relation_tuples(
        self,
        namespace: str,
        relation: str | None = None,
        object_id: str | None = None,
    ) -> list[RelationTuple]:
        return [
            t
            for t in self.tuples
            if t.namespace == namespace
            and (relation is None or t.relation == relation)
            and (object_id is None or t.object == object_id)
        ]

    async def check(self, namespace: str, object_id: str, relation: str, subject_id: str) -> bool:
        return any(
            t.namespace == namespace
            and t.object == object_id
            and t.relation == relation
            and t.subject_id == subject_id
            for t in self.tuples
        )

    async def aclose(self) -> None:
        pass


# Plate 3/4's exact worked example: sparc (org) > nbu-clinic (project) >
# acme-mep (contractor). Marius owns the org; Vogel manages the project;
# Weber manages acme-mep; Bauer views acme-mep.
@pytest.fixture
def keto() -> FakeKetoReadClient:
    client = FakeKetoReadClient()
    client.set_parent("nbu-clinic", "sparc")
    client.set_parent("acme-mep", "nbu-clinic")
    client.grant("sparc", "owners", "marius")
    client.grant("nbu-clinic", "managers", "vogel")
    client.grant("acme-mep", "managers", "weber")
    client.grant("acme-mep", "viewers", "bauer")
    return client


class TestCheckGroupPermit:
    async def test_owner_has_admin_on_own_group(self, keto: FakeKetoReadClient) -> None:
        assert await check_group_permit(keto, "sparc", "admin", "marius") is True

    async def test_owner_admin_traverses_down_to_every_descendant(
        self, keto: FakeKetoReadClient
    ) -> None:
        # Marius owns sparc; admin/manage/write must all resolve true at
        # every descendant, matching Plate 4's "Marius: R W" on every body
        # of work.
        assert await check_group_permit(keto, "acme-mep", "write", "marius") is True
        assert await check_group_permit(keto, "acme-mep", "manage", "marius") is True
        assert await check_group_permit(keto, "acme-mep", "admin", "marius") is True

    async def test_project_manager_writes_below_but_not_above(
        self, keto: FakeKetoReadClient
    ) -> None:
        assert await check_group_permit(keto, "acme-mep", "write", "vogel") is True
        assert await check_group_permit(keto, "sparc", "write", "vogel") is False

    async def test_contractor_manager_confined_to_own_group(self, keto: FakeKetoReadClient) -> None:
        assert await check_group_permit(keto, "acme-mep", "write", "weber") is True
        assert await check_group_permit(keto, "nbu-clinic", "write", "weber") is False

    async def test_viewer_reads_but_does_not_write(self, keto: FakeKetoReadClient) -> None:
        assert await check_group_permit(keto, "acme-mep", "read", "bauer") is True
        assert await check_group_permit(keto, "acme-mep", "write", "bauer") is False

    async def test_read_does_not_traverse_the_tree(self, keto: FakeKetoReadClient) -> None:
        # Bauer is a viewer of acme-mep only — nothing grants them read on
        # the project or org, and read must NOT walk toward the parent for
        # someone who only holds a leaf-level viewer tuple.
        assert await check_group_permit(keto, "nbu-clinic", "read", "bauer") is False
        assert await check_group_permit(keto, "sparc", "read", "bauer") is False

    async def test_stranger_has_no_permit_anywhere(self, keto: FakeKetoReadClient) -> None:
        assert await check_group_permit(keto, "acme-mep", "read", "nobody") is False
        assert await check_group_permit(keto, "acme-mep", "admin", "nobody") is False


class TestOwnStandingRank:
    async def test_matches_the_ladder(self, keto: FakeKetoReadClient) -> None:
        assert await own_standing_rank(keto, "sparc", "marius") == STANDING_RANK["owners"]
        assert await own_standing_rank(keto, "nbu-clinic", "vogel") == STANDING_RANK["managers"]
        assert await own_standing_rank(keto, "acme-mep", "bauer") == STANDING_RANK["viewers"]
        assert await own_standing_rank(keto, "acme-mep", "nobody") == 0

    async def test_ancestor_standing_traverses_down(self, keto: FakeKetoReadClient) -> None:
        # Vogel manages nbu-clinic, so his effective standing at acme-mep
        # (a descendant) is also "managers" — Plate 4's whole point.
        assert await own_standing_rank(keto, "acme-mep", "vogel") == STANDING_RANK["managers"]


class TestAssertCanGrant:
    async def test_owner_may_grant_any_standing_including_another_owner(
        self, keto: FakeKetoReadClient
    ) -> None:
        for relation in ("owners", "managers", "editors", "viewers"):
            await assert_can_grant(keto, "sparc", "marius", relation)  # must not raise

    async def test_manager_may_grant_editors_and_viewers(self, keto: FakeKetoReadClient) -> None:
        await assert_can_grant(keto, "acme-mep", "weber", "editors")
        await assert_can_grant(keto, "acme-mep", "weber", "viewers")

    async def test_manager_cannot_grant_manager_or_owner(self, keto: FakeKetoReadClient) -> None:
        with pytest.raises(InsufficientStandingError):
            await assert_can_grant(keto, "acme-mep", "weber", "managers")
        with pytest.raises(InsufficientStandingError):
            await assert_can_grant(keto, "acme-mep", "weber", "owners")

    async def test_viewer_cannot_grant_anything(self, keto: FakeKetoReadClient) -> None:
        with pytest.raises(InsufficientStandingError):
            await assert_can_grant(keto, "acme-mep", "bauer", "viewers")

    async def test_stranger_with_no_standing_cannot_grant(self, keto: FakeKetoReadClient) -> None:
        with pytest.raises(InsufficientStandingError):
            await assert_can_grant(keto, "acme-mep", "nobody", "viewers")

    async def test_unknown_relation_is_rejected(self, keto: FakeKetoReadClient) -> None:
        with pytest.raises(UnknownRelationError):
            await assert_can_grant(keto, "sparc", "marius", "administrator")

    async def test_project_manager_may_grant_at_a_descendant_contractor(
        self, keto: FakeKetoReadClient
    ) -> None:
        # Vogel's manager standing traverses down to acme-mep, so he may
        # grant editors/viewers there too, not just at nbu-clinic itself.
        await assert_can_grant(keto, "acme-mep", "vogel", "editors")
        with pytest.raises(InsufficientStandingError):
            await assert_can_grant(keto, "acme-mep", "vogel", "managers")
