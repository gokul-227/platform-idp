from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

import yaml
from jsonschema import Draft7Validator, FormatChecker

from app_registry.types import AppRegistryDefinition

_ENABLED_LINE_RE = re.compile(r"^enabled:\s*(true|false)\s*$", re.MULTILINE)


def _is_template_file(filename: str) -> bool:
    return filename.startswith("_")


@lru_cache
def _get_validator(schema_path: Path) -> Draft7Validator:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return Draft7Validator(schema, format_checker=FormatChecker())


def list_registry_files(registry_path: Path) -> list[str]:
    if not registry_path.exists():
        raise FileNotFoundError(f"Registry path does not exist: {registry_path}")

    return sorted(
        entry.name
        for entry in registry_path.iterdir()
        if entry.is_file()
        and entry.suffix in (".yaml", ".yml")
        and not _is_template_file(entry.name)
    )


def load_registry_definition(
    registry_path: Path, filename: str, schema_path: Path
) -> AppRegistryDefinition:
    file_path = registry_path / filename
    parsed = yaml.safe_load(file_path.read_text(encoding="utf-8"))

    validator = _get_validator(schema_path)
    errors = sorted(validator.iter_errors(parsed), key=lambda error: list(error.path))
    if errors:
        details = "; ".join(
            f"{'/' + '/'.join(str(part) for part in error.path) or '/'} {error.message}"
            for error in errors
        )
        raise ValueError(f"Invalid registry definition in {filename}: {details}")

    return AppRegistryDefinition.model_validate(parsed)


def load_all_definitions(
    registry_path: Path, schema_path: Path
) -> list[tuple[str, AppRegistryDefinition]]:
    return [
        (filename, load_registry_definition(registry_path, filename, schema_path))
        for filename in list_registry_files(registry_path)
    ]


def find_definition_filename(registry_path: Path, schema_path: Path, client_id: str) -> str | None:
    for filename, definition in load_all_definitions(registry_path, schema_path):
        if definition.client_id == client_id:
            return filename
    return None


def write_definition(
    registry_path: Path, filename: str, definition: AppRegistryDefinition, schema_path: Path
) -> None:
    """Create or fully overwrite one registry YAML file from a definition.

    Unlike set_enabled, this is a real yaml.safe_dump — any hand-written
    comments in an existing file are lost. That's an accepted tradeoff for
    a full field edit (name/redirect_uris/scope/grant_types/...) coming
    from the console's Applications page; set_enabled's targeted regex
    approach only works because it touches exactly one already-known line.
    Validated against the schema before writing, so a bad edit never lands
    on disk.
    """
    payload = definition.model_dump(exclude_none=True, mode="json")
    validator = _get_validator(schema_path)
    errors = sorted(validator.iter_errors(payload), key=lambda error: list(error.path))
    if errors:
        details = "; ".join(
            f"{'/' + '/'.join(str(part) for part in error.path) or '/'} {error.message}"
            for error in errors
        )
        raise ValueError(f"Invalid registry definition for {filename}: {details}")

    file_path = registry_path / filename
    file_path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")


def delete_definition_file(registry_path: Path, filename: str) -> None:
    file_path = registry_path / filename
    file_path.unlink(missing_ok=True)


def set_enabled(registry_path: Path, filename: str, enabled: bool) -> None:
    """Flip the `enabled:` field of one registry YAML file in place.

    Uses a targeted regex replace rather than yaml.safe_load + yaml.dump so
    the file's hand-written comments and key order survive untouched — this
    is the only field the admin console is allowed to mutate on disk.
    """
    file_path = registry_path / filename
    text = file_path.read_text(encoding="utf-8")
    replacement = f"enabled: {'true' if enabled else 'false'}"

    new_text, count = _ENABLED_LINE_RE.subn(replacement, text, count=1)
    if count == 0:
        separator = "" if text.endswith("\n") else "\n"
        new_text = f"{text}{separator}{replacement}\n"

    file_path.write_text(new_text, encoding="utf-8")
