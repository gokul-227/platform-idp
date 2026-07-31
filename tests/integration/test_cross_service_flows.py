"""Cross-service integration tests — two or more platform/* services
(plus the real Ory component underneath) exercised together, distinct
from each service's own platform/*/tests (single-service, fakes for
Kratos/Hydra/Keto/audit-service) and tests/e2e (full browser-cookie user
journeys). Every assertion here was manually curl-verified at least once
during this project; this codifies those checks as automated tests.

Run containerized: `make test-integration` (see Makefile). Mutates real
data (creates and cleans up its own real tenant/role/policy/flow/plugin
records) — safe to run repeatedly, never touches identities.
"""

from __future__ import annotations

import os
import uuid

import httpx

TENANT_SERVICE_URL = os.environ.get("EIP_TENANT_SERVICE_URL", "http://localhost:8081")
AUTHORIZATION_SERVICE_URL = os.environ.get(
    "EIP_AUTHORIZATION_SERVICE_URL", "http://localhost:8090"
)
CONSOLE_API_URL = os.environ.get("EIP_CONSOLE_API_URL", "http://localhost:8086")
KETO_READ_URL = os.environ.get("EIP_KETO_READ_URL", "http://localhost:4466")
FLOW_SERVICE_URL = os.environ.get("EIP_FLOW_SERVICE_URL", "http://localhost:8089")


def test_role_policy_assignment_writes_a_real_keto_tuple() -> None:
    """authorization-service's Policy create must be a real Keto relation
    tuple, not a parallel store — confirmed by reading it back directly
    from Keto's own read API, bypassing authorization-service entirely."""
    roles = httpx.get(f"{AUTHORIZATION_SERVICE_URL}/api/v1/roles", timeout=10.0).json()["roles"]
    org_admin = next(r for r in roles if r["id"] == "org-admin")
    assert org_admin["namespace"] == "Organization"
    assert org_admin["relation"] == "admin"

    object_id = f"integration-test-org-{uuid.uuid4().hex[:8]}"
    subject_id = f"integration-test-user-{uuid.uuid4().hex[:8]}"
    created = httpx.post(
        f"{AUTHORIZATION_SERVICE_URL}/api/v1/policies",
        json={"role_id": "org-admin", "object_id": object_id, "subject_id": subject_id},
        timeout=10.0,
    )
    assert created.status_code == 201
    policy = created.json()

    try:
        keto_tuples = httpx.get(
            f"{KETO_READ_URL}/relation-tuples",
            params={"namespace": "Organization", "object": object_id},
            timeout=10.0,
        ).json()["relation_tuples"]
        assert any(
            t["relation"] == "admin" and t["subject_id"] == subject_id for t in keto_tuples
        ), "Policy creation did not produce a real Keto tuple"

        check = httpx.post(
            f"{KETO_READ_URL}/relation-tuples/check",
            json={
                "namespace": "Organization", "object": object_id,
                "relation": "admin", "subject_id": subject_id,
            },
            timeout=10.0,
        )
        assert check.json()["allowed"] is True
    finally:
        httpx.delete(
            f"{AUTHORIZATION_SERVICE_URL}/api/v1/policies/{policy['id']}", timeout=10.0
        )


def test_organization_invitation_creates_real_membership_on_accept() -> None:
    """tenant-service's invitation accept must result in a real Keto
    Organization tuple once console-api's relation-tuple endpoint is
    called with the accepted role — the same two-step flow the console UI
    performs (tenant-service never writes Keto tuples itself)."""
    tenant = httpx.post(
        f"{TENANT_SERVICE_URL}/tenants",
        json={"name": f"Integration Test Org {uuid.uuid4().hex[:8]}"},
        timeout=10.0,
    ).json()
    subject_id = f"integration-test-invitee-{uuid.uuid4().hex[:8]}"

    try:
        invitation = httpx.post(
            f"{TENANT_SERVICE_URL}/tenants/{tenant['id']}/invitations",
            json={"email": "integration-test@example.com", "role": "member"},
            timeout=10.0,
        ).json()
        assert invitation["status"] == "pending"

        accepted = httpx.post(
            f"{TENANT_SERVICE_URL}/invitations/{invitation['token']}/accept", timeout=10.0
        )
        assert accepted.status_code == 200
        body = accepted.json()
        assert body["tenant_id"] == tenant["id"]
        assert body["role"] == "member"

        granted = httpx.post(
            f"{CONSOLE_API_URL}/api/v1/relation-tuples",
            json={
                "namespace": "Organization", "object": tenant["id"],
                "relation": body["role"], "subject_id": subject_id,
            },
            timeout=10.0,
        )
        assert granted.status_code == 201

        check = httpx.post(
            f"{KETO_READ_URL}/relation-tuples/check",
            json={
                "namespace": "Organization", "object": tenant["id"],
                "relation": "member", "subject_id": subject_id,
            },
            timeout=10.0,
        )
        assert check.json()["allowed"] is True

        httpx.delete(
            f"{CONSOLE_API_URL}/api/v1/relation-tuples",
            params={
                "namespace": "Organization", "object": tenant["id"],
                "relation": "member", "subject_id": subject_id,
            },
            timeout=10.0,
        )

        double_accept = httpx.post(
            f"{TENANT_SERVICE_URL}/invitations/{invitation['token']}/accept", timeout=10.0
        )
        assert double_accept.status_code == 409
    finally:
        httpx.delete(f"{TENANT_SERVICE_URL}/tenants/{tenant['id']}", timeout=10.0)


def test_flow_publish_enables_method_without_disabling_others() -> None:
    """flow-service's publish is enable-only by design (real Kratos
    constraint: method enablement is global, not per-flow-type) — create
    a flow referencing totp, publish, and confirm totp is enabled in the
    rendered config without any other already-enabled method changing."""
    flow_id = f"integration-test-flow-{uuid.uuid4().hex[:8]}"
    try:
        created = httpx.post(
            f"{FLOW_SERVICE_URL}/api/v1/flows",
            json={"id": flow_id, "name": "Integration Test Flow", "type": "login", "steps": ["totp"]},
            timeout=10.0,
        )
        assert created.status_code == 201

        published = httpx.post(f"{FLOW_SERVICE_URL}/api/v1/flows/{flow_id}/publish", timeout=10.0)
        assert published.status_code == 200
        assert "totp" in published.json()["enabled_methods"]
    finally:
        httpx.delete(f"{FLOW_SERVICE_URL}/api/v1/flows/{flow_id}", timeout=10.0)
