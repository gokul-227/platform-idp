from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from authorization_service.audit_client import AuditClient
from authorization_service.group_authz import (
    InsufficientStandingError,
    UnknownRelationError,
    assert_can_grant,
    check_group_permit,
)
from authorization_service.keto_client import KetoAdminClient, KetoReadClient
from authorization_service.logging_config import configure_logging, log
from authorization_service.policies import (
    Policy,
    PolicyNotFoundError,
    create_policy,
    decode_policy_id,
    delete_policy,
    list_policies,
)
from authorization_service.roles import (
    VALID_ROLE_TARGETS,
    InvalidRoleTargetError,
    Role,
    RoleNotFoundError,
    delete_role,
    get_role,
    list_roles,
    seed_default_roles,
    write_role,
)

logger = configure_logging()


def _roles_dir() -> Path:
    return Path(os.environ.get("ROLES_CONFIG_PATH", "/etc/config/authorization/roles"))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    audit_service_url = os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087")
    keto_read_url = os.environ.get("KETO_READ_URL", "http://keto:4466")
    keto_write_url = os.environ.get("KETO_WRITE_URL", "http://keto:4467")
    app.state.audit = AuditClient(audit_service_url)
    app.state.keto_read = KetoReadClient(keto_read_url)
    app.state.keto_admin = KetoAdminClient(keto_write_url)
    seed_default_roles(_roles_dir())
    try:
        yield
    finally:
        await app.state.audit.aclose()
        await app.state.keto_read.aclose()
        await app.state.keto_admin.aclose()


app = FastAPI(title="authorization-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(
        status_code=200, content={"status": "healthy", "service": "authorization-service"}
    )


class AuthorizeRequest(BaseModel):
    """Matches the real Keto `Organization` tuple shape already written by
    `platform/hooks` (`Organization:{organization_id}#{relation}@{subject_id}`)
    — `subject_id` is a Kratos identity id, `organization_id` is an
    Organization object id (including the reserved `"platform"` id used for
    platform-wide admin bootstrap), `relation` is `member` or `admin` (the
    only two relations hooks actually writes; see hooks_service/keto_client.py).
    """

    subject_id: str
    organization_id: str
    relation: str = "member"


@app.post("/api/v1/authorize")
async def authorize(body: AuthorizeRequest) -> JSONResponse:
    """The missing "application request -> authorization-service -> Keto
    check -> allow/deny" endpoint: a thin, real ReBAC check in front of
    Keto's own `/relation-tuples/check`, exposed so Oathkeeper's
    `remote_json` authorizer (or any other application) can point at this
    service instead of Keto directly.

    Status convention deliberately mirrors Keto's own `/relation-tuples/check`
    contract exactly (confirmed live against the running Keto instance):
    HTTP 200 + `{"allowed": true}` when the relation tuple holds, HTTP 403 +
    `{"allowed": false}` when it doesn't. This is required, not just a style
    choice — Oathkeeper's `remote_json` authorizer already expects this
    two-status/one-body-shape contract from Keto for the platform's other
    `remote_json`-protected routes, so matching it exactly is what makes this
    endpoint a drop-in `remote` target with zero Oathkeeper-side changes
    beyond pointing at a different URL.
    """
    keto_read: KetoReadClient = app.state.keto_read
    allowed = await keto_read.check(
        "Organization", body.organization_id, body.relation, body.subject_id
    )
    log(
        logger,
        logging.INFO,
        "Authorization check",
        subject_id=body.subject_id,
        organization_id=body.organization_id,
        relation=body.relation,
        allowed=allowed,
    )
    return JSONResponse(status_code=200 if allowed else 403, content={"allowed": allowed})


class GroupAuthorizeRequest(BaseModel):
    """Real Keto ReBAC check for the new Group model (authz-architecture.html),
    computed by group_authz.py (see that module's docstring for why this is
    application-level logic rather than a native Keto userset rewrite)."""

    subject_id: str
    permit: str = "read"


@app.post("/api/v1/groups/{group_id}/authorize")
async def authorize_group(group_id: str, body: GroupAuthorizeRequest) -> JSONResponse:
    """Same 200/403 + `{"allowed": bool}` contract as `/api/v1/authorize`,
    for the new Group namespace's computed read/write/manage/admin permits
    (with parent-tree traversal) instead of a literal Organization relation.
    """
    if body.permit not in ("read", "write", "manage", "admin"):
        return JSONResponse(
            status_code=422,
            content={
                "error": f"Unknown permit {body.permit!r} — must be read, write, manage, or admin"
            },
        )
    keto_read: KetoReadClient = app.state.keto_read
    allowed = await check_group_permit(keto_read, group_id, body.permit, body.subject_id)
    log(
        logger,
        logging.INFO,
        "Group authorization check",
        group_id=group_id,
        subject_id=body.subject_id,
        permit=body.permit,
        allowed=allowed,
    )
    return JSONResponse(status_code=200 if allowed else 403, content={"allowed": allowed})


class GroupGrantRequest(BaseModel):
    """`granter_subject_id` is the acting user (whose own standing on
    `group_id` is checked against `relation` before anything is written —
    see group_authz.assert_can_grant); `target_subject_id` is who receives
    the standing. Both are Kratos identity ids for the common case; Keto
    itself also supports a subject_set target (e.g. joining a whole other
    group's roster, `Group:nbu-clinic#viewers@(Group:acme-mep#viewers)`)
    but that's not exposed through this simple identity-to-identity
    endpoint yet — write it via the existing Policies API
    (VALID_ROLE_TARGETS now includes Group) if needed, which does not run
    the delegation guard."""

    granter_subject_id: str
    target_subject_id: str
    relation: str


@app.post("/api/v1/groups/{group_id}/grants")
async def grant_group_standing(group_id: str, body: GroupGrantRequest) -> JSONResponse:
    keto_read: KetoReadClient = app.state.keto_read
    keto_admin: KetoAdminClient = app.state.keto_admin
    try:
        await assert_can_grant(keto_read, group_id, body.granter_subject_id, body.relation)
    except UnknownRelationError as error:
        return JSONResponse(status_code=422, content={"error": str(error)})
    except InsufficientStandingError as error:
        return JSONResponse(status_code=403, content={"error": str(error)})

    await keto_admin.create_relationship("Group", group_id, body.relation, body.target_subject_id)
    log(
        logger,
        logging.INFO,
        "Granted group standing",
        group_id=group_id,
        granter_subject_id=body.granter_subject_id,
        target_subject_id=body.target_subject_id,
        relation=body.relation,
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="group.grant",
        resource_type="Group",
        resource_id=group_id,
        actor_id=body.granter_subject_id,
        metadata={"target_subject_id": body.target_subject_id, "relation": body.relation},
    )
    return JSONResponse(status_code=201, content={"allowed": True, "relation": body.relation})


@app.delete("/api/v1/groups/{group_id}/grants")
async def revoke_group_standing(group_id: str, body: GroupGrantRequest) -> Response:
    # Revoke runs the SAME escalation guard as grant, not just an
    # "any manager can revoke anything" check — demoting/removing someone
    # is also a standing mutation (Plate 2's rule applies symmetrically:
    # a manager still cannot touch another manager's or an owner's tuple).
    keto_read: KetoReadClient = app.state.keto_read
    keto_admin: KetoAdminClient = app.state.keto_admin
    try:
        await assert_can_grant(keto_read, group_id, body.granter_subject_id, body.relation)
    except UnknownRelationError as error:
        return JSONResponse(status_code=422, content={"error": str(error)})
    except InsufficientStandingError as error:
        return JSONResponse(status_code=403, content={"error": str(error)})

    await keto_admin.delete_relationship("Group", group_id, body.relation, body.target_subject_id)
    log(
        logger,
        logging.INFO,
        "Revoked group standing",
        group_id=group_id,
        granter_subject_id=body.granter_subject_id,
        target_subject_id=body.target_subject_id,
        relation=body.relation,
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="group.revoke",
        resource_type="Group",
        resource_id=group_id,
        actor_id=body.granter_subject_id,
        metadata={"target_subject_id": body.target_subject_id, "relation": body.relation},
    )
    return Response(status_code=204)


@app.get("/api/v1/roles/namespaces")
async def get_role_namespaces() -> JSONResponse:
    return JSONResponse(status_code=200, content=VALID_ROLE_TARGETS)


@app.get("/api/v1/roles")
async def get_roles() -> JSONResponse:
    roles = list_roles(_roles_dir())
    return JSONResponse(status_code=200, content={"roles": [r.model_dump() for r in roles]})


@app.post("/api/v1/roles")
async def create_role(body: Role) -> JSONResponse:
    roles_dir = _roles_dir()
    if (roles_dir / f"{body.id}.yaml").exists():
        return JSONResponse(status_code=409, content={"error": f"Role already exists: {body.id}"})
    try:
        write_role(roles_dir, body)
    except InvalidRoleTargetError as error:
        return JSONResponse(status_code=422, content={"error": str(error)})
    log(logger, logging.INFO, "Created role", role_id=body.id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="role.create",
        resource_type="role",
        resource_id=body.id,
        metadata={"namespace": body.namespace, "relation": body.relation},
    )
    return JSONResponse(status_code=201, content=body.model_dump())


@app.put("/api/v1/roles/{role_id}")
async def update_role(role_id: str, body: Role) -> JSONResponse:
    roles_dir = _roles_dir()
    try:
        get_role(roles_dir, role_id)
    except RoleNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown role: {role_id}"})
    try:
        write_role(roles_dir, body)
    except InvalidRoleTargetError as error:
        return JSONResponse(status_code=422, content={"error": str(error)})
    log(logger, logging.INFO, "Updated role", role_id=role_id)
    audit: AuditClient = app.state.audit
    await audit.record(logger, action="role.update", resource_type="role", resource_id=role_id)
    return JSONResponse(status_code=200, content=body.model_dump())


@app.delete("/api/v1/roles/{role_id}")
async def remove_role(role_id: str) -> Response:
    try:
        delete_role(_roles_dir(), role_id)
    except RoleNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown role: {role_id}"})
    log(logger, logging.INFO, "Deleted role", role_id=role_id)
    audit: AuditClient = app.state.audit
    await audit.record(logger, action="role.delete", resource_type="role", resource_id=role_id)
    return Response(status_code=204)


@app.get("/api/v1/policies")
async def get_policies(role_id: str | None = None) -> JSONResponse:
    roles = list_roles(_roles_dir())
    keto_read: KetoReadClient = app.state.keto_read
    policies = await list_policies(keto_read, roles, role_id=role_id)
    return JSONResponse(status_code=200, content={"policies": [p.model_dump() for p in policies]})


class CreatePolicyRequest(BaseModel):
    role_id: str
    object_id: str
    subject_id: str


@app.post("/api/v1/policies")
async def create_policy_endpoint(body: CreatePolicyRequest) -> JSONResponse:
    try:
        role = get_role(_roles_dir(), body.role_id)
    except RoleNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown role: {body.role_id}"})
    keto_admin: KetoAdminClient = app.state.keto_admin
    policy = await create_policy(keto_admin, role, body.object_id, body.subject_id)
    log(
        logger,
        logging.INFO,
        "Created policy",
        role_id=role.id,
        object_id=body.object_id,
        subject_id=body.subject_id,
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="policy.create",
        resource_type=role.namespace,
        resource_id=body.object_id,
        metadata={"role_id": role.id, "relation": role.relation, "subject_id": body.subject_id},
    )
    return JSONResponse(status_code=201, content=policy.model_dump())


class UpdatePolicyRequest(BaseModel):
    object_id: str
    subject_id: str


@app.put("/api/v1/policies/{policy_id}")
async def update_policy_endpoint(policy_id: str, body: UpdatePolicyRequest) -> JSONResponse:
    keto_admin: KetoAdminClient = app.state.keto_admin
    try:
        old_namespace, old_object, old_relation, old_subject = decode_policy_id(policy_id)
    except PolicyNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown policy: {policy_id}"})
    roles = list_roles(_roles_dir())
    role = next(
        (r for r in roles if r.namespace == old_namespace and r.relation == old_relation), None
    )
    if role is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown policy: {policy_id}"})
    await keto_admin.delete_relationship(old_namespace, old_object, old_relation, old_subject)
    policy: Policy = await create_policy(keto_admin, role, body.object_id, body.subject_id)
    log(logger, logging.INFO, "Updated policy", policy_id=policy_id, new_id=policy.id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="policy.update",
        resource_type=role.namespace,
        resource_id=body.object_id,
        metadata={"role_id": role.id, "subject_id": body.subject_id},
    )
    return JSONResponse(status_code=200, content=policy.model_dump())


@app.delete("/api/v1/policies/{policy_id}")
async def delete_policy_endpoint(policy_id: str) -> Response:
    try:
        namespace, object_id, relation, subject_id = decode_policy_id(policy_id)
    except PolicyNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown policy: {policy_id}"})
    keto_admin: KetoAdminClient = app.state.keto_admin
    await delete_policy(keto_admin, policy_id)
    log(logger, logging.INFO, "Deleted policy", policy_id=policy_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="policy.delete",
        resource_type=namespace,
        resource_id=object_id,
        metadata={"relation": relation, "subject_id": subject_id},
    )
    return Response(status_code=204)
