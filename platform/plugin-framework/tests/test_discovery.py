from __future__ import annotations

import json
from pathlib import Path

import pytest

from plugin_framework.discovery import PluginLoadError, discover_plugins
from plugin_framework.manifest import PluginManifestError


def test_discover_plugins_loads_matching_type(plugins_dir: Path) -> None:
    loaded = discover_plugins(plugins_dir, plugin_type="widget")
    assert set(loaded) == {"widget-basic"}
    assert loaded["widget-basic"].kind == "basic"


def test_discover_plugins_filters_out_other_types(plugins_dir: Path) -> None:
    loaded = discover_plugins(plugins_dir, plugin_type="email")
    assert loaded == {}


def test_discover_plugins_missing_directory_returns_empty(tmp_path: Path) -> None:
    loaded = discover_plugins(tmp_path / "does-not-exist", plugin_type="widget")
    assert loaded == {}


def test_discover_plugins_missing_entry_module_raises(tmp_path: Path) -> None:
    plugin_dir = tmp_path / "broken"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {"name": "broken", "version": "1.0.0", "type": "widget", "entry": "missing:Thing"}
        ),
        encoding="utf-8",
    )

    with pytest.raises(PluginLoadError):
        discover_plugins(tmp_path, plugin_type="widget")


def test_discover_plugins_missing_attribute_raises(tmp_path: Path) -> None:
    plugin_dir = tmp_path / "broken"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {"name": "broken", "version": "1.0.0", "type": "widget", "entry": "provider:Missing"}
        ),
        encoding="utf-8",
    )
    (plugin_dir / "provider.py").write_text("class Widget:\n    pass\n", encoding="utf-8")

    with pytest.raises(PluginLoadError):
        discover_plugins(tmp_path, plugin_type="widget")


def test_discover_plugins_duplicate_name_raises(tmp_path: Path) -> None:
    # Two different plugin directories whose manifests both declare the same
    # "name" — the collision discover_plugins must reject.
    for directory_name in ("plugin-a", "plugin-b"):
        plugin_dir = tmp_path / directory_name
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text(
            json.dumps(
                {"name": "dup", "version": "1.0.0", "type": "widget", "entry": "provider:Widget"}
            ),
            encoding="utf-8",
        )
        (plugin_dir / "provider.py").write_text("class Widget:\n    pass\n", encoding="utf-8")

    with pytest.raises(PluginManifestError):
        discover_plugins(tmp_path, plugin_type="widget")
