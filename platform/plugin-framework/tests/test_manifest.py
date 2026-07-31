from __future__ import annotations

import json
from pathlib import Path

import pytest

from plugin_framework.manifest import PluginManifest, PluginManifestError


def test_from_file_parses_valid_manifest(tmp_path: Path) -> None:
    manifest_path = tmp_path / "plugin.json"
    manifest_path.write_text(
        json.dumps(
            {
                "name": "email-smtp",
                "version": "1.0.0",
                "type": "email",
                "entry": "provider:SmtpEmailProvider",
            }
        ),
        encoding="utf-8",
    )

    manifest = PluginManifest.from_file(manifest_path)
    assert manifest.name == "email-smtp"
    assert manifest.type == "email"
    assert manifest.entry == "provider:SmtpEmailProvider"
    assert manifest.directory == tmp_path


def test_from_file_rejects_missing_required_field(tmp_path: Path) -> None:
    manifest_path = tmp_path / "plugin.json"
    manifest_path.write_text(json.dumps({"name": "x", "version": "1.0.0"}), encoding="utf-8")

    with pytest.raises(PluginManifestError):
        PluginManifest.from_file(manifest_path)


def test_from_file_rejects_invalid_entry_format(tmp_path: Path) -> None:
    manifest_path = tmp_path / "plugin.json"
    manifest_path.write_text(
        json.dumps({"name": "x", "version": "1.0.0", "type": "email", "entry": "no-colon-here"}),
        encoding="utf-8",
    )

    with pytest.raises(PluginManifestError):
        PluginManifest.from_file(manifest_path)


def test_from_file_rejects_invalid_json(tmp_path: Path) -> None:
    manifest_path = tmp_path / "plugin.json"
    manifest_path.write_text("{not json", encoding="utf-8")

    with pytest.raises(PluginManifestError):
        PluginManifest.from_file(manifest_path)
