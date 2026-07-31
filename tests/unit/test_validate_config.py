"""Tests for repository configuration validation."""

from automation.validation.validate_config import (
    validate_declared_schemas,
    validate_json_syntax,
    validate_yaml_syntax,
)


def test_yaml_syntax_is_valid() -> None:
    assert validate_yaml_syntax() == []


def test_json_syntax_is_valid() -> None:
    assert validate_json_syntax() == []


def test_declared_schemas_are_valid() -> None:
    assert validate_declared_schemas() == []
