"""Policies: a Role assigned to a subject on a specific object instance.

A Policy has no storage of its own — it *is* a real Keto relation tuple.
Listing policies means reading live tuples back from Keto for each Role's
(namespace, relation) and attaching the Role's friendly name; creating or
deleting a policy means writing or deleting that same tuple through Keto's
admin API. This is deliberately not a parallel authorization datastore.

A Policy's `id` is a stable encoding of the (namespace, object, relation,
subject_id) tuple it wraps, so delete can address a specific tuple round-
trip through the console without inventing a new identifier Keto doesn't
know about. Base64 (not a plain "a:b:c:d" join) because object/subject ids
may themselves legally contain ":".
"""

from __future__ import annotations

import base64
import json

from authorization_service.keto_client import KetoAdminClient, KetoReadClient
from authorization_service.roles import Role


class PolicyNotFoundError(Exception):
    def __init__(self, policy_id: str) -> None:
        super().__init__(f"Unknown policy: {policy_id}")
        self.policy_id = policy_id


class Policy:
    def __init__(
        self,
        id: str,
        role_id: str,
        role_name: str,  # noqa: A002 - public field name
        namespace: str,
        relation: str,
        object: str,
        subject_id: str,  # noqa: A002
    ) -> None:
        self.id = id
        self.role_id = role_id
        self.role_name = role_name
        self.namespace = namespace
        self.relation = relation
        self.object = object
        self.subject_id = subject_id

    def model_dump(self) -> dict[str, str]:
        return {
            "id": self.id,
            "role_id": self.role_id,
            "role_name": self.role_name,
            "namespace": self.namespace,
            "relation": self.relation,
            "object": self.object,
            "subject_id": self.subject_id,
        }


def encode_policy_id(namespace: str, object_id: str, relation: str, subject_id: str) -> str:
    payload = json.dumps([namespace, object_id, relation, subject_id])
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def decode_policy_id(policy_id: str) -> tuple[str, str, str, str]:
    try:
        namespace, object_id, relation, subject_id = json.loads(
            base64.urlsafe_b64decode(policy_id.encode("ascii")).decode("utf-8")
        )
    except Exception as error:
        raise PolicyNotFoundError(policy_id) from error
    return namespace, object_id, relation, subject_id


async def list_policies(
    keto_read: KetoReadClient, roles: list[Role], role_id: str | None = None
) -> list[Policy]:
    target_roles = [r for r in roles if role_id is None or r.id == role_id]
    policies: list[Policy] = []
    for role in target_roles:
        tuples = await keto_read.list_relation_tuples(role.namespace, role.relation)
        for tuple_ in tuples:
            if tuple_.subject_id is None:
                continue
            policies.append(
                Policy(
                    id=encode_policy_id(
                        role.namespace, tuple_.object, role.relation, tuple_.subject_id
                    ),
                    role_id=role.id,
                    role_name=role.name,
                    namespace=role.namespace,
                    relation=role.relation,
                    object=tuple_.object,
                    subject_id=tuple_.subject_id,
                )
            )
    return policies


async def create_policy(
    keto_admin: KetoAdminClient, role: Role, object_id: str, subject_id: str
) -> Policy:
    await keto_admin.create_relationship(role.namespace, object_id, role.relation, subject_id)
    return Policy(
        id=encode_policy_id(role.namespace, object_id, role.relation, subject_id),
        role_id=role.id,
        role_name=role.name,
        namespace=role.namespace,
        relation=role.relation,
        object=object_id,
        subject_id=subject_id,
    )


async def delete_policy(keto_admin: KetoAdminClient, policy_id: str) -> None:
    namespace, object_id, relation, subject_id = decode_policy_id(policy_id)
    await keto_admin.delete_relationship(namespace, object_id, relation, subject_id)
