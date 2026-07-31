"""plugin.json manifest schema and validation, per docs/10-reference/adr/ADR-0004."""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft7Validator

MANIFEST_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "version", "type", "entry"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "version": {"type": "string", "minLength": 1},
        "type": {"type": "string", "minLength": 1},
        "description": {"type": "string"},
        "config_schema": {"type": "string"},
        # "<module>:<attribute>" — see discovery.load_entry.
        "entry": {"type": "string", "pattern": "^[^:]+:[^:]+$"},
    },
}

_VALIDATOR = Draft7Validator(MANIFEST_SCHEMA)


class PluginManifestError(ValueError):
    pass


class PluginManifest:
    def __init__(
        self,
        *,
        name: str,
        version: str,
        type: str,  # noqa: A002 - matches the manifest field name (plugin.json's "type")
        entry: str,
        description: str = "",
        config_schema: str | None = None,
        directory: Path | None = None,
    ) -> None:
        self.name = name
        self.version = version
        self.type = type
        self.entry = entry
        self.description = description
        self.config_schema = config_schema
        self.directory = directory

    @classmethod
    def from_file(cls, manifest_path: Path) -> PluginManifest:
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise PluginManifestError(f"{manifest_path}: invalid JSON: {error}") from error

        errors = sorted(_VALIDATOR.iter_errors(data), key=lambda e: list(e.path))
        if errors:
            details = "; ".join(
                f"{'/'.join(str(p) for p in e.path) or '/'} {e.message}" for e in errors
            )
            raise PluginManifestError(f"{manifest_path}: {details}")

        return cls(
            name=data["name"],
            version=data["version"],
            type=data["type"],
            entry=data["entry"],
            description=data.get("description", ""),
            config_schema=data.get("config_schema"),
            directory=manifest_path.parent,
        )
