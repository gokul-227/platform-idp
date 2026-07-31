from __future__ import annotations

from pathlib import Path

import pytest

from plugin_service.registry import (
    MissingDependencyError,
    PluginDefinition,
    PluginNotFoundError,
    PluginVersionNotFoundError,
    delete_config_plugin,
    get_config_plugin,
    list_all_plugins,
    list_code_plugins,
    list_config_plugins,
    list_plugin_history,
    rollback_plugin,
    validate_dependencies,
    write_config_plugin,
)


def test_write_and_read_roundtrip(tmp_path: Path) -> None:
    definition = PluginDefinition(id="test-plugin", name="Test Plugin", type="notification")
    write_config_plugin(tmp_path, definition)

    loaded = get_config_plugin(tmp_path, "test-plugin")
    assert loaded.name == "Test Plugin"
    assert loaded.enabled is True


def test_list_config_plugins_returns_all(tmp_path: Path) -> None:
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="A", type="theme"))
    write_config_plugin(tmp_path, PluginDefinition(id="b", name="B", type="policy"))

    definitions = list_config_plugins(tmp_path)
    assert {d.id for d in definitions} == {"a", "b"}


def test_get_config_plugin_unknown_raises(tmp_path: Path) -> None:
    with pytest.raises(PluginNotFoundError):
        get_config_plugin(tmp_path, "does-not-exist")


def test_delete_config_plugin_removes_file(tmp_path: Path) -> None:
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="A", type="theme"))
    delete_config_plugin(tmp_path, "a")
    assert list_config_plugins(tmp_path) == []


def test_delete_config_plugin_unknown_raises(tmp_path: Path) -> None:
    with pytest.raises(PluginNotFoundError):
        delete_config_plugin(tmp_path, "does-not-exist")


def test_list_code_plugins_reads_manifests_without_executing(tmp_path: Path) -> None:
    plugin_dir = tmp_path / "smtp"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        '{"name": "smtp", "version": "1.0.0", "type": "email", "entry": "provider:X"}',
        encoding="utf-8",
    )
    # Deliberately no provider.py — if this executed the entry, it would fail.
    views = list_code_plugins(tmp_path)
    assert len(views) == 1
    assert views[0].id == "smtp"
    assert views[0].source == "code"


def test_list_all_plugins_merges_config_and_code(tmp_path: Path) -> None:
    plugins_dir = tmp_path / "config"
    code_dir = tmp_path / "code"
    code_dir.mkdir()
    (code_dir / "smtp").mkdir()
    (code_dir / "smtp" / "plugin.json").write_text(
        '{"name": "smtp", "version": "1.0.0", "type": "notification", "entry": "provider:X"}',
        encoding="utf-8",
    )
    write_config_plugin(
        plugins_dir, PluginDefinition(id="google", name="Google", type="identity-provider")
    )

    plugins = list_all_plugins(plugins_dir, code_dir)
    sources = {p.id: p.source for p in plugins}
    assert sources == {"smtp": "code", "google": "config"}


def test_validate_dependencies_passes_for_known_plugin(tmp_path: Path) -> None:
    write_config_plugin(tmp_path, PluginDefinition(id="base", name="Base", type="theme"))
    definition = PluginDefinition(
        id="dependent", name="Dependent", type="theme", dependencies=["base"]
    )
    validate_dependencies(definition, tmp_path, tmp_path / "code")


def test_validate_dependencies_raises_for_unknown_plugin(tmp_path: Path) -> None:
    definition = PluginDefinition(
        id="dependent", name="Dependent", type="theme", dependencies=["does-not-exist"]
    )
    with pytest.raises(MissingDependencyError):
        validate_dependencies(definition, tmp_path, tmp_path / "code")


def test_write_plugin_creates_history_version_on_update(tmp_path: Path) -> None:
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="A", type="theme"))
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="Renamed", type="theme"))

    history = list_plugin_history(tmp_path, "a")
    assert len(history) == 1


def test_rollback_plugin_restores_previous_version(tmp_path: Path) -> None:
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="A", type="theme"))
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="Renamed", type="theme"))
    version_id = list_plugin_history(tmp_path, "a")[0]["id"]

    restored = rollback_plugin(tmp_path, "a", version_id)
    assert restored.name == "A"
    assert get_config_plugin(tmp_path, "a").name == "A"


def test_rollback_unknown_plugin_version_raises(tmp_path: Path) -> None:
    write_config_plugin(tmp_path, PluginDefinition(id="a", name="A", type="theme"))
    with pytest.raises(PluginVersionNotFoundError):
        rollback_plugin(tmp_path, "a", "does-not-exist")
