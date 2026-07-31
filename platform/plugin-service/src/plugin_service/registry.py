"""configuration/plugins/*.yaml CRUD, plus a read-only merge of real code-plugin
manifests (plugins/*/plugin.json) for visibility — see this package's
README for why those are two different concerns kept separate.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel

PLUGIN_TYPES = (
    "authentication",
    "identity-provider",
    "theme",
    "notification",
    "application",
    "policy",
    "workflow",
)


class PluginNotFoundError(Exception):
    def __init__(self, plugin_id: str) -> None:
        super().__init__(f"Unknown plugin: {plugin_id}")
        self.plugin_id = plugin_id


class PluginVersionNotFoundError(Exception):
    def __init__(self, version_id: str) -> None:
        super().__init__(f"Unknown plugin version: {version_id}")
        self.version_id = version_id


class MissingDependencyError(Exception):
    def __init__(self, missing: list[str]) -> None:
        super().__init__(f"Unknown dependencies: {', '.join(missing)}")
        self.missing = missing


class PluginDefinition(BaseModel):
    id: str
    name: str
    type: Literal[
        "authentication",
        "identity-provider",
        "theme",
        "notification",
        "application",
        "policy",
        "workflow",
    ]
    version: str = "1.0.0"
    enabled: bool = True
    order: int = 0
    dependencies: list[str] = []
    config: dict[str, Any] = {}
    description: str = ""
    documentation_url: str = ""
    icon_url: str = ""


class PluginView(BaseModel):
    id: str
    name: str
    type: str
    version: str
    enabled: bool
    order: int
    dependencies: list[str]
    config: dict[str, Any]
    source: Literal["config", "code"]
    description: str = ""
    documentation_url: str = ""
    icon_url: str = ""


def _config_plugin_path(plugins_dir: Path, plugin_id: str) -> Path:
    return plugins_dir / f"{plugin_id}.yaml"


def list_config_plugins(plugins_dir: Path) -> list[PluginDefinition]:
    if not plugins_dir.exists():
        return []
    definitions = []
    for path in sorted(plugins_dir.glob("*.yaml")):
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        definitions.append(PluginDefinition.model_validate(document))
    return definitions


def get_config_plugin(plugins_dir: Path, plugin_id: str) -> PluginDefinition:
    path = _config_plugin_path(plugins_dir, plugin_id)
    if not path.exists():
        raise PluginNotFoundError(plugin_id)
    return PluginDefinition.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def _history_dir(plugins_dir: Path, plugin_id: str) -> Path:
    return plugins_dir / "history" / plugin_id


def validate_dependencies(
    definition: PluginDefinition, plugins_dir: Path, code_plugins_dir: Path
) -> None:
    """Real validation: every listed dependency must be another plugin
    this service actually knows about (config-defined or a real code
    plugin manifest) — not just an arbitrary string."""
    known_ids = {p.id for p in list_all_plugins(plugins_dir, code_plugins_dir)}
    known_ids.add(definition.id)
    missing = [dep for dep in definition.dependencies if dep not in known_ids]
    if missing:
        raise MissingDependencyError(missing)


def write_config_plugin(plugins_dir: Path, definition: PluginDefinition) -> None:
    """Snapshots the plugin's previous file (if any) into history/<id>/
    first — same versioning pattern as console_api.theme and
    flow_service.registry."""
    plugins_dir.mkdir(parents=True, exist_ok=True)
    path = _config_plugin_path(plugins_dir, definition.id)
    if path.exists():
        history_dir = _history_dir(plugins_dir, definition.id)
        history_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        (history_dir / f"{timestamp}.yaml").write_bytes(path.read_bytes())
    path.write_text(yaml.safe_dump(definition.model_dump(), sort_keys=False), encoding="utf-8")


def list_plugin_history(plugins_dir: Path, plugin_id: str) -> list[dict[str, str]]:
    history_dir = _history_dir(plugins_dir, plugin_id)
    if not history_dir.exists():
        return []
    return [
        {"id": p.stem, "created_at": p.stem}
        for p in sorted(history_dir.glob("*.yaml"), reverse=True)
    ]


def rollback_plugin(plugins_dir: Path, plugin_id: str, version_id: str) -> PluginDefinition:
    version_path = _history_dir(plugins_dir, plugin_id) / f"{version_id}.yaml"
    if not version_path.exists():
        raise PluginVersionNotFoundError(version_id)
    definition = PluginDefinition.model_validate(
        yaml.safe_load(version_path.read_text(encoding="utf-8"))
    )
    write_config_plugin(plugins_dir, definition)
    return definition


def delete_config_plugin(plugins_dir: Path, plugin_id: str) -> None:
    path = _config_plugin_path(plugins_dir, plugin_id)
    if not path.exists():
        raise PluginNotFoundError(plugin_id)
    path.unlink()


def list_code_plugins(code_plugins_dir: Path) -> list[PluginView]:
    """Reads plugin.json manifests only (no code import/execution) — this
    is a read-only visibility feature, not plugin_framework.discovery's
    module-loading behavior, which is for the consuming service's own
    startup, not an admin listing."""
    if not code_plugins_dir.exists():
        return []
    views = []
    for manifest_path in sorted(code_plugins_dir.glob("*/plugin.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        views.append(
            PluginView(
                config={},
                dependencies=[],
                description=manifest.get("description", ""),
                enabled=True,
                id=manifest["name"],
                name=manifest["name"],
                order=0,
                source="code",
                type=manifest["type"],
                version=manifest["version"],
            )
        )
    return views


def list_all_plugins(plugins_dir: Path, code_plugins_dir: Path) -> list[PluginView]:
    config_views = [
        PluginView(**definition.model_dump(), source="config")
        for definition in list_config_plugins(plugins_dir)
    ]
    return sorted(
        [*config_views, *list_code_plugins(code_plugins_dir)],
        key=lambda p: (p.type, p.order, p.id),
    )
