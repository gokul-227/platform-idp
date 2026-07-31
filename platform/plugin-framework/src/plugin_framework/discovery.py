"""Scans a plugins directory for plugin.json manifests and loads their entry points."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

from plugin_framework.manifest import PluginManifest, PluginManifestError


class PluginLoadError(RuntimeError):
    pass


def load_entry(manifest: PluginManifest) -> Any:
    """Import the module named in `entry` ("<module>:<attribute>") from the
    plugin's own directory and return the named attribute."""
    if manifest.directory is None:
        raise PluginLoadError(f"Plugin {manifest.name!r} has no directory to load from")

    module_name, _, attribute_name = manifest.entry.partition(":")
    module_path = manifest.directory / f"{module_name}.py"
    if not module_path.exists():
        raise PluginLoadError(f"Plugin {manifest.name!r} entry module not found: {module_path}")

    qualified_name = f"plugin_framework._loaded.{manifest.name}.{module_name}"
    spec = importlib.util.spec_from_file_location(qualified_name, module_path)
    if spec is None or spec.loader is None:
        raise PluginLoadError(f"Plugin {manifest.name!r}: could not load spec for {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[qualified_name] = module
    spec.loader.exec_module(module)

    if not hasattr(module, attribute_name):
        raise PluginLoadError(
            f"Plugin {manifest.name!r} entry {manifest.entry!r}: "
            f"module has no attribute {attribute_name!r}"
        )
    return getattr(module, attribute_name)


def discover_plugins(plugins_dir: Path, plugin_type: str) -> dict[str, Any]:
    """Scan `plugins_dir` for `*/plugin.json` manifests of the given `type`,
    load each one's entry point, and return {plugin_name: loaded_entry}.

    Raises PluginManifestError / PluginLoadError on the first malformed or
    unloadable plugin — a broken plugin should fail startup loudly rather
    than be silently skipped.
    """
    if not plugins_dir.exists():
        return {}

    loaded: dict[str, Any] = {}
    for manifest_path in sorted(plugins_dir.glob("*/plugin.json")):
        manifest = PluginManifest.from_file(manifest_path)
        if manifest.type != plugin_type:
            continue
        if manifest.name in loaded:
            raise PluginManifestError(f"Duplicate plugin name {manifest.name!r} in {plugins_dir}")
        loaded[manifest.name] = load_entry(manifest)

    return loaded
