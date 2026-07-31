from __future__ import annotations

from pathlib import Path

import pytest

from authorization_service.roles import (
    InvalidRoleTargetError,
    Role,
    RoleNotFoundError,
    delete_role,
    get_role,
    list_roles,
    seed_default_roles,
    write_role,
)


def test_write_and_read_roundtrip(tmp_path: Path) -> None:
    role = Role(
        id="org-admin", name="Organization Admin", namespace="Organization", relation="admin"
    )
    write_role(tmp_path, role)

    loaded = get_role(tmp_path, "org-admin")
    assert loaded.name == "Organization Admin"


def test_write_role_rejects_unknown_namespace_relation(tmp_path: Path) -> None:
    role = Role(id="bogus", name="Bogus", namespace="Organization", relation="does-not-exist")
    with pytest.raises(InvalidRoleTargetError):
        write_role(tmp_path, role)


def test_list_roles_returns_all(tmp_path: Path) -> None:
    write_role(tmp_path, Role(id="a", name="A", namespace="Team", relation="manager"))
    write_role(tmp_path, Role(id="b", name="B", namespace="Team", relation="member"))

    roles = list_roles(tmp_path)
    assert {r.id for r in roles} == {"a", "b"}


def test_get_role_unknown_raises(tmp_path: Path) -> None:
    with pytest.raises(RoleNotFoundError):
        get_role(tmp_path, "does-not-exist")


def test_delete_role_removes_file(tmp_path: Path) -> None:
    write_role(tmp_path, Role(id="a", name="A", namespace="Team", relation="manager"))
    delete_role(tmp_path, "a")
    assert list_roles(tmp_path) == []


def test_delete_role_unknown_raises(tmp_path: Path) -> None:
    with pytest.raises(RoleNotFoundError):
        delete_role(tmp_path, "does-not-exist")


def test_seed_default_roles_populates_empty_dir(tmp_path: Path) -> None:
    seed_default_roles(tmp_path)
    roles = list_roles(tmp_path)
    assert len(roles) >= 10
    assert {r.id for r in roles} >= {"org-admin", "project-owner", "resource-viewer"}


def test_seed_default_roles_does_not_overwrite_existing(tmp_path: Path) -> None:
    write_role(
        tmp_path,
        Role(id="org-admin", name="Custom Name", namespace="Organization", relation="admin"),
    )
    seed_default_roles(tmp_path)
    assert get_role(tmp_path, "org-admin").name == "Custom Name"
