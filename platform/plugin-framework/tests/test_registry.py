from __future__ import annotations

import pytest

from plugin_framework.registry import PluginNotFoundError, PluginRegistry


def test_select_returns_registered_plugin() -> None:
    registry = PluginRegistry({"a": object(), "b": object()})
    assert registry.select("a") is not None


def test_select_missing_plugin_raises_with_available_names() -> None:
    registry = PluginRegistry({"a": object()})
    with pytest.raises(PluginNotFoundError, match="a"):
        registry.select("z")


def test_contains_and_names() -> None:
    registry = PluginRegistry({"b": object(), "a": object()})
    assert "a" in registry
    assert "z" not in registry
    assert registry.names() == ["a", "b"]
