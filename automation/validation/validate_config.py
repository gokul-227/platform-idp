"""Validate repository configuration syntax and declared JSON schemas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft7Validator, FormatChecker

# automation/validation/validate_config.py -> automation/validation -> automation -> repo root
ROOT = Path(__file__).resolve().parents[2]
# "templates" excludes Helm chart templates (helm/*/templates/*.yaml) —
# Go-templated YAML is not parseable as raw YAML before rendering; those
# files are validated by `helm lint` / `helm template` instead (see the
# Makefile's helm targets). "charts" excludes downloaded subchart archives'
# unpacked trees if any ever land on disk.
EXCLUDED_PARTS = {".git", "node_modules", ".terraform", "dist", ".venv", "templates", "charts"}


def repository_files(*suffixes: str) -> list[Path]:
    """Return source-controlled files matching suffixes, excluding generated trees."""
    return sorted(
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and path.suffix in suffixes
        and not EXCLUDED_PARTS.intersection(path.relative_to(ROOT).parts)
    )


def load_yaml(path: Path) -> Any:
    """Load every YAML document so syntax failures identify their source file."""
    with path.open(encoding="utf-8") as source:
        documents = list(yaml.safe_load_all(source))
    return documents[0] if len(documents) == 1 else documents


def validate_yaml_syntax() -> list[str]:
    """Validate all repository YAML files."""
    errors: list[str] = []
    for path in repository_files(".yaml", ".yml"):
        try:
            load_yaml(path)
        except yaml.YAMLError as error:
            errors.append(f"{path.relative_to(ROOT)}: {error}")
    return errors


def validate_json_syntax() -> list[str]:
    """Validate all repository JSON files."""
    errors: list[str] = []
    for path in repository_files(".json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            errors.append(f"{path.relative_to(ROOT)}: {error}")
    return errors


def validate_schema(instance_path: Path, schema_path: Path) -> list[str]:
    """Validate one YAML instance against one Draft 7 JSON schema."""
    instance = load_yaml(instance_path)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft7Validator(schema, format_checker=FormatChecker())
    return [
        f"{instance_path.relative_to(ROOT)}{error.json_path}: {error.message}"
        for error in sorted(validator.iter_errors(instance), key=lambda item: item.json_path)
    ]


def validate_declared_schemas() -> list[str]:
    """Validate platform configuration and non-template application definitions."""
    schema_dir = ROOT / "configuration" / "schemas"
    errors = validate_schema(
        ROOT / "configuration" / "cloud.yaml", schema_dir / "cloud.schema.json"
    )
    errors.extend(
        validate_schema(
            ROOT / "configuration" / "platform.yaml", schema_dir / "platform.schema.json"
        )
    )
    for definition in sorted((ROOT / "integrations" / "applications").glob("*.y*ml")):
        if not definition.name.startswith("_"):
            errors.extend(validate_schema(definition, schema_dir / "app-registry.schema.json"))
    return errors


def run_validation() -> list[str]:
    """Run every syntax and schema validation rule."""
    return validate_yaml_syntax() + validate_json_syntax() + validate_declared_schemas()


def main() -> int:
    """Run validation and emit each failure to standard error."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    errors = run_validation()
    if errors:
        print("\n".join(errors))
        return 1
    print("Configuration schemas and syntax are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
