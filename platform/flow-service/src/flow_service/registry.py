"""configuration/flows/*.yaml CRUD, plus applying enabled flows' steps to Kratos's
already-rendered config — see this package's README for the real Kratos
constraint (method enablement is global, not per-flow-type) this works
around by being enable-only, never auto-disabling a method.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel

FLOW_TYPES = ("login", "registration", "recovery", "verification", "settings")

# Every method key kratos.yaml.tmpl actually defines under
# selfservice.methods.* — steps outside this set are rejected rather than
# silently accepted and never applied.
KNOWN_METHODS = (
    "password",
    "oidc",
    "passkey",
    "webauthn",
    "totp",
    "lookup_secret",
    "code",
    "link",
)


class FlowNotFoundError(Exception):
    def __init__(self, flow_id: str) -> None:
        super().__init__(f"Unknown flow: {flow_id}")
        self.flow_id = flow_id


class FlowDefinition(BaseModel):
    id: str
    name: str
    type: Literal["login", "registration", "recovery", "verification", "settings"]
    enabled: bool = True
    steps: list[str] = []


def _flow_path(flows_dir: Path, flow_id: str) -> Path:
    return flows_dir / f"{flow_id}.yaml"


def list_flows(flows_dir: Path) -> list[FlowDefinition]:
    if not flows_dir.exists():
        return []
    return [
        FlowDefinition.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        for path in sorted(flows_dir.glob("*.yaml"))
    ]


def get_flow(flows_dir: Path, flow_id: str) -> FlowDefinition:
    path = _flow_path(flows_dir, flow_id)
    if not path.exists():
        raise FlowNotFoundError(flow_id)
    return FlowDefinition.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


class FlowVersionNotFoundError(Exception):
    def __init__(self, version_id: str) -> None:
        super().__init__(f"Unknown flow version: {version_id}")
        self.version_id = version_id


def _history_dir(flows_dir: Path, flow_id: str) -> Path:
    return flows_dir / "history" / flow_id


def write_flow(flows_dir: Path, definition: FlowDefinition) -> None:
    """Snapshots the flow's previous file (if any) into history/<id>/ first
    — every save is a real, recoverable version, same pattern as
    console_api.theme.write_theme."""
    flows_dir.mkdir(parents=True, exist_ok=True)
    path = _flow_path(flows_dir, definition.id)
    if path.exists():
        history_dir = _history_dir(flows_dir, definition.id)
        history_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        (history_dir / f"{timestamp}.yaml").write_bytes(path.read_bytes())
    path.write_text(yaml.safe_dump(definition.model_dump(), sort_keys=False), encoding="utf-8")


def list_flow_history(flows_dir: Path, flow_id: str) -> list[dict[str, str]]:
    history_dir = _history_dir(flows_dir, flow_id)
    if not history_dir.exists():
        return []
    return [
        {"id": p.stem, "created_at": p.stem}
        for p in sorted(history_dir.glob("*.yaml"), reverse=True)
    ]


def rollback_flow(flows_dir: Path, flow_id: str, version_id: str) -> FlowDefinition:
    version_path = _history_dir(flows_dir, flow_id) / f"{version_id}.yaml"
    if not version_path.exists():
        raise FlowVersionNotFoundError(version_id)
    definition = FlowDefinition.model_validate(
        yaml.safe_load(version_path.read_text(encoding="utf-8"))
    )
    write_flow(flows_dir, definition)
    return definition


def delete_flow(flows_dir: Path, flow_id: str) -> None:
    path = _flow_path(flows_dir, flow_id)
    if not path.exists():
        raise FlowNotFoundError(flow_id)
    path.unlink()


def methods_to_enable(flows_dir: Path) -> set[str]:
    """Union of steps across every *enabled* flow — the set of methods
    `publish` will turn on. Never returns a set implying disablement."""
    methods: set[str] = set()
    for definition in list_flows(flows_dir):
        if definition.enabled:
            methods.update(definition.steps)
    return methods & set(KNOWN_METHODS)


def publish_to_rendered_config(flows_dir: Path, rendered_kratos_config_path: Path) -> set[str]:
    """Enable-only: turns on `selfservice.methods.<m>.enabled` for every
    method referenced by an enabled flow. Never sets a method to disabled —
    see this module's docstring and the package README for why."""
    to_enable = methods_to_enable(flows_dir)

    document = yaml.safe_load(rendered_kratos_config_path.read_text(encoding="utf-8"))
    methods_config = document.setdefault("selfservice", {}).setdefault("methods", {})
    for method in to_enable:
        methods_config.setdefault(method, {})["enabled"] = True

    rendered_kratos_config_path.write_text(
        yaml.safe_dump(document, sort_keys=False), encoding="utf-8"
    )
    return to_enable
