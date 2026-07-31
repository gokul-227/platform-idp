"""Manages configuration/identity-providers.yaml and applies it to Kratos's
rendered config.

Two separate concerns, deliberately not merged:
- `load_providers`/`set_provider_enabled`: read/write the small source-of-
  truth file the console's Identity Providers page edits. Fast, safe,
  no Kratos involvement.
- `apply_to_rendered_config`: filters an ALREADY-RENDERED kratos.yaml's
  `authentication_methods.oidc.config.providers` list down to only the
  enabled ids. This runs as a one-shot step between config-render
  (envsubst — no conditional logic, can't do this filtering itself) and
  Kratos's own startup — see docker-compose.dev.yml's
  identity-providers-render service. It does not, by itself, restart
  Kratos: Kratos has no runtime config-reload API in the open-source
  edition, so a toggle here only takes effect on the next Kratos restart.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

_ENABLED_LINE_RE = re.compile(r"^(\s*)enabled:\s*(true|false)\s*$", re.MULTILINE)


class UnknownProviderError(Exception):
    def __init__(self, provider_id: str) -> None:
        super().__init__(f"Unknown identity provider: {provider_id}")
        self.provider_id = provider_id


def load_providers(path: Path) -> list[dict[str, Any]]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    providers: list[dict[str, Any]] = document.get("providers", [])
    return providers


def set_provider_enabled(path: Path, provider_id: str, enabled: bool) -> None:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    id_line_index = next(
        (i for i, line in enumerate(lines) if line.strip() == f"- id: {provider_id}"), None
    )
    if id_line_index is None:
        raise UnknownProviderError(provider_id)

    for offset in range(id_line_index + 1, len(lines)):
        match = re.match(r"^(\s*)enabled:\s*(true|false)\s*$", lines[offset])
        if match:
            lines[offset] = f"{match.group(1)}enabled: {'true' if enabled else 'false'}\n"
            path.write_text("".join(lines), encoding="utf-8")
            return
        if lines[offset].strip().startswith("- id:"):
            break

    raise UnknownProviderError(provider_id)


def load_provider_metadata(rendered_kratos_config_path: Path) -> dict[str, dict[str, Any]]:
    """Real, non-secret per-provider config from the already-rendered
    kratos.yaml — label, real provider type, and scope list, plus whether a
    client_id is actually set (never the client_id value itself or the
    secret — this is safe to show verbatim to an admin, that isn't). Read-
    only; this file is the SAME rendered config Kratos itself starts from,
    just mounted a second time (see docker-compose.dev.yml's console-api
    volumes) — no separate copy that could drift.

    Returns {} entirely (not per-key) if the rendered file doesn't exist
    yet (e.g. Kratos hasn't started for the first time) — callers should
    treat a missing entry as "metadata unavailable," not "misconfigured."
    """
    if not rendered_kratos_config_path.exists():
        return {}
    document = yaml.safe_load(rendered_kratos_config_path.read_text(encoding="utf-8"))
    providers = (
        document.get("selfservice", {})
        .get("methods", {})
        .get("oidc", {})
        .get("config", {})
        .get("providers", [])
    )
    return {
        p["id"]: {
            "label": p.get("label", p.get("id")),
            "provider": p.get("provider", p.get("id")),
            "scope": p.get("scope", []),
            "client_id_configured": bool(p.get("client_id")),
        }
        for p in providers
    }


def apply_to_rendered_config(providers_path: Path, rendered_kratos_config_path: Path) -> None:
    providers = load_providers(providers_path)
    enabled_ids = {p["id"] for p in providers if p.get("enabled", True)}

    document = yaml.safe_load(rendered_kratos_config_path.read_text(encoding="utf-8"))
    oidc_config = (
        document.get("selfservice", {}).get("methods", {}).get("oidc", {}).get("config", {})
    )
    existing = oidc_config.get("providers", [])
    oidc_config["providers"] = [p for p in existing if p.get("id") in enabled_ids]

    rendered_kratos_config_path.write_text(
        yaml.safe_dump(document, sort_keys=False), encoding="utf-8"
    )
