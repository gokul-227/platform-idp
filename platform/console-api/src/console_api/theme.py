"""Reads/writes the identity-ui Theme config file (configuration/themes/*.yaml).

Mirrors identity-ui/themes/types.ts's Theme interface field-for-field —
that TypeScript interface is the contract; this is the Python side of the
same YAML file. identity-ui/themes/load-theme.ts caches the parsed theme
for the life of the Node process, so a change here only takes effect on
the next identity-ui restart (same tradeoff as identity_providers.py's
Kratos-config filtering — no runtime hot-reload on the consuming side).
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml


class ThemeVersionNotFoundError(Exception):
    def __init__(self, version_id: str) -> None:
        super().__init__(f"Unknown theme version: {version_id}")
        self.version_id = version_id


def load_theme(path: Path) -> dict[str, Any]:
    document: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    return document


def _history_dir(path: Path) -> Path:
    return path.parent / "history"


def write_theme(path: Path, theme: dict[str, Any]) -> None:
    """Snapshots the current file into history/ (if one exists) before
    overwriting it — every save is a real, recoverable version, not just
    the single latest state."""
    if path.exists():
        history_dir = _history_dir(path)
        history_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        (history_dir / f"{timestamp}.yaml").write_bytes(path.read_bytes())
    path.write_text(yaml.safe_dump(theme, sort_keys=False), encoding="utf-8")


def list_theme_history(path: Path) -> list[dict[str, str]]:
    history_dir = _history_dir(path)
    if not history_dir.exists():
        return []
    return [
        {"id": p.stem, "created_at": p.stem}
        for p in sorted(history_dir.glob("*.yaml"), reverse=True)
    ]


def get_theme_history_version(path: Path, version_id: str) -> dict[str, Any]:
    version_path = _history_dir(path) / f"{version_id}.yaml"
    if not version_path.exists():
        raise ThemeVersionNotFoundError(version_id)
    document: dict[str, Any] = yaml.safe_load(version_path.read_text(encoding="utf-8"))
    return document


def rollback_theme(path: Path, version_id: str) -> dict[str, Any]:
    """Restores a historical version as the current theme — itself
    snapshotted first via write_theme, so rolling back is never lossy."""
    version = get_theme_history_version(path, version_id)
    write_theme(path, version)
    return version
