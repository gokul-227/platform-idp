from __future__ import annotations

import pytest

from authorization_service.keto_client import KetoAdminClient, KetoReadClient, RelationTuple
from authorization_service.policies import (
    PolicyNotFoundError,
    create_policy,
    decode_policy_id,
    delete_policy,
    encode_policy_id,
    list_policies,
)
from authorization_service.roles import Role

ORG_ADMIN = Role(
    id="org-admin", name="Organization Admin", namespace="Organization", relation="admin"
)
TEAM_MANAGER = Role(id="team-manager", name="Team Manager", namespace="Team", relation="manager")


class FakeKetoReadClient(KetoReadClient):
    def __init__(self, tuples: list[RelationTuple]) -> None:
        self._tuples = tuples

    async def list_relation_tuples(
        self,
        namespace: str,
        relation: str | None = None,
        object_id: str | None = None,
    ) -> list[RelationTuple]:
        return [
            t
            for t in self._tuples
            if t.namespace == namespace
            and (relation is None or t.relation == relation)
            and (object_id is None or t.object == object_id)
        ]


class FakeKetoAdminClient(KetoAdminClient):
    def __init__(self) -> None:
        self.created: list[tuple[str, str, str, str]] = []
        self.deleted: list[tuple[str, str, str, str]] = []

    async def create_relationship(
        self, namespace: str, object_id: str, relation: str, subject_id: str
    ) -> None:
        self.created.append((namespace, object_id, relation, subject_id))

    async def delete_relationship(
        self, namespace: str, object_id: str, relation: str, subject_id: str
    ) -> None:
        self.deleted.append((namespace, object_id, relation, subject_id))


def test_encode_decode_policy_id_roundtrip() -> None:
    encoded = encode_policy_id("Organization", "acme", "admin", "user-1")
    assert decode_policy_id(encoded) == ("Organization", "acme", "admin", "user-1")


def test_decode_invalid_policy_id_raises() -> None:
    with pytest.raises(PolicyNotFoundError):
        decode_policy_id("not-valid-base64-json!!")


def _sample_tuples() -> list[RelationTuple]:
    return [
        RelationTuple(
            namespace="Organization", object="acme", relation="admin", subject_id="user-1"
        ),
        RelationTuple(namespace="Team", object="eng", relation="manager", subject_id="user-2"),
    ]


async def test_list_policies_reads_live_keto_tuples() -> None:
    fake_read = FakeKetoReadClient(_sample_tuples())
    policies = await list_policies(fake_read, [ORG_ADMIN, TEAM_MANAGER])
    assert len(policies) == 2
    by_role = {p.role_id: p for p in policies}
    assert by_role["org-admin"].object == "acme"
    assert by_role["org-admin"].subject_id == "user-1"
    assert by_role["team-manager"].object == "eng"


async def test_list_policies_filters_by_role_id() -> None:
    fake_read = FakeKetoReadClient(_sample_tuples())
    policies = await list_policies(fake_read, [ORG_ADMIN, TEAM_MANAGER], role_id="org-admin")
    assert len(policies) == 1
    assert policies[0].role_id == "org-admin"


async def test_create_policy_writes_real_keto_tuple() -> None:
    fake_admin = FakeKetoAdminClient()
    policy = await create_policy(fake_admin, ORG_ADMIN, "acme", "user-1")
    assert fake_admin.created == [("Organization", "acme", "admin", "user-1")]
    assert policy.role_id == "org-admin"
    assert policy.object == "acme"


async def test_delete_policy_deletes_real_keto_tuple() -> None:
    fake_admin = FakeKetoAdminClient()
    policy_id = encode_policy_id("Organization", "acme", "admin", "user-1")
    await delete_policy(fake_admin, policy_id)
    assert fake_admin.deleted == [("Organization", "acme", "admin", "user-1")]
