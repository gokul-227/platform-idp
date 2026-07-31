from __future__ import annotations

from pathlib import Path

import pytest

from app_registry.registry_loader import (
    delete_definition_file,
    find_definition_filename,
    list_registry_files,
    load_all_definitions,
    load_registry_definition,
    set_enabled,
    write_definition,
)
from app_registry.types import AppRegistryDefinition

INVALID_DEFINITION = """
client_id: bad app
client_name: Bad Application
redirect_uris: []
grant_types:
  - authorization_code
scope: openid
"""


def test_list_registry_files_excludes_templates(registry_dir: Path) -> None:
    files = list_registry_files(registry_dir)
    assert files == ["disabled-app.yaml", "test-app.yaml"]


def test_list_registry_files_missing_path_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        list_registry_files(tmp_path / "does-not-exist")


def test_load_registry_definition_parses_valid_file(registry_dir: Path, schema_path: Path) -> None:
    definition = load_registry_definition(registry_dir, "test-app.yaml", schema_path)
    assert definition.client_id == "test-app"
    assert definition.is_enabled is True
    assert definition.tags == ["test"]


def test_load_registry_definition_disabled_flag(registry_dir: Path, schema_path: Path) -> None:
    definition = load_registry_definition(registry_dir, "disabled-app.yaml", schema_path)
    assert definition.is_enabled is False


def test_load_registry_definition_invalid_raises(tmp_path: Path, schema_path: Path) -> None:
    (tmp_path / "invalid.yaml").write_text(INVALID_DEFINITION, encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid registry definition"):
        load_registry_definition(tmp_path, "invalid.yaml", schema_path)


def test_load_all_definitions_returns_filename_pairs(registry_dir: Path, schema_path: Path) -> None:
    definitions = load_all_definitions(registry_dir, schema_path)
    assert [filename for filename, _ in definitions] == ["disabled-app.yaml", "test-app.yaml"]


def test_find_definition_filename_matches_client_id(registry_dir: Path, schema_path: Path) -> None:
    assert find_definition_filename(registry_dir, schema_path, "test-app") == "test-app.yaml"


def test_find_definition_filename_unknown_returns_none(
    registry_dir: Path, schema_path: Path
) -> None:
    assert find_definition_filename(registry_dir, schema_path, "nope") is None


def test_set_enabled_flips_existing_flag_preserving_rest_of_file(registry_dir: Path) -> None:
    set_enabled(registry_dir, "test-app.yaml", False)
    text = (registry_dir / "test-app.yaml").read_text(encoding="utf-8")
    assert "enabled: false" in text
    assert "client_id: test-app" in text
    assert "tags:\n  - test" in text


def test_set_enabled_inserts_flag_when_absent(tmp_path: Path) -> None:
    (tmp_path / "no-flag.yaml").write_text(
        "client_id: no-flag\nclient_name: No Flag\n", encoding="utf-8"
    )
    set_enabled(tmp_path, "no-flag.yaml", True)
    text = (tmp_path / "no-flag.yaml").read_text(encoding="utf-8")
    assert text == "client_id: no-flag\nclient_name: No Flag\nenabled: true\n"


def test_write_definition_creates_new_file(tmp_path: Path, schema_path: Path) -> None:
    definition = AppRegistryDefinition(
        client_id="new-app",
        client_name="New Application",
        redirect_uris=["http://localhost:4455/auth/callback"],
        grant_types=["authorization_code"],
        scope="openid",
    )
    write_definition(tmp_path, "new-app.yaml", definition, schema_path)

    loaded = load_registry_definition(tmp_path, "new-app.yaml", schema_path)
    assert loaded.client_id == "new-app"
    assert loaded.client_name == "New Application"


def test_write_definition_overwrites_existing_file(registry_dir: Path, schema_path: Path) -> None:
    definition = AppRegistryDefinition(
        client_id="test-app",
        client_name="Renamed",
        redirect_uris=["http://localhost:4455/auth/callback"],
        grant_types=["authorization_code"],
        scope="openid",
    )
    write_definition(registry_dir, "test-app.yaml", definition, schema_path)

    loaded = load_registry_definition(registry_dir, "test-app.yaml", schema_path)
    assert loaded.client_name == "Renamed"
    assert loaded.tags == []


def test_write_definition_rejects_invalid_client_id(tmp_path: Path, schema_path: Path) -> None:
    definition = AppRegistryDefinition.model_construct(
        client_id="bad app",
        client_name="Bad",
        redirect_uris=["http://localhost:4455/auth/callback"],
        grant_types=["authorization_code"],
        scope="openid",
    )
    with pytest.raises(ValueError, match="Invalid registry definition"):
        write_definition(tmp_path, "bad.yaml", definition, schema_path)
    assert not (tmp_path / "bad.yaml").exists()


def test_delete_definition_file_removes_file(registry_dir: Path) -> None:
    delete_definition_file(registry_dir, "test-app.yaml")
    assert not (registry_dir / "test-app.yaml").exists()


def test_delete_definition_file_missing_file_is_noop(tmp_path: Path) -> None:
    delete_definition_file(tmp_path, "does-not-exist.yaml")
