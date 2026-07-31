from __future__ import annotations

from typing import Any


class PluginNotFoundError(KeyError):
    pass


class PluginRegistry:
    """Name -> loaded-entry lookup, matching configuration/platform.yaml's
    `<category>.provider: <plugin-name>` selection convention."""

    def __init__(self, plugins: dict[str, Any]) -> None:
        self._plugins = dict(plugins)

    def select(self, name: str) -> Any:
        if name not in self._plugins:
            available = ", ".join(sorted(self._plugins)) or "none"
            raise PluginNotFoundError(
                f"No plugin named {name!r} registered (available: {available})"
            )
        return self._plugins[name]

    def names(self) -> list[str]:
        return sorted(self._plugins)

    def __contains__(self, name: str) -> bool:
        return name in self._plugins
