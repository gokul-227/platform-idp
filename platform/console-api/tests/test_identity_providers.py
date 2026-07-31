from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from console_api.identity_providers import (
    UnknownProviderError,
    apply_to_rendered_config,
    load_provider_metadata,
    load_providers,
    set_provider_enabled,
)

PROVIDERS_YAML = """\
providers:
  - id: google
    enabled: true
  - id: github
    enabled: true
  - id: microsoft
    enabled: false
"""

RENDERED_KRATOS_YAML = """\
selfservice:
  methods:
    oidc:
      enabled: true
      config:
        providers:
          - id: google
            provider: google
            label: "Google"
            client_id: abc
            client_secret: super-secret-value
            scope:
              - email
              - profile
              - openid
          - id: github
            provider: github
            client_id: def
          - id: microsoft
            provider: microsoft
            client_id: ghi
"""


@pytest.fixture
def providers_path(tmp_path: Path) -> Path:
    path = tmp_path / "identity-providers.yaml"
    path.write_text(PROVIDERS_YAML, encoding="utf-8")
    return path


@pytest.fixture
def rendered_config_path(tmp_path: Path) -> Path:
    path = tmp_path / "kratos.yaml"
    path.write_text(RENDERED_KRATOS_YAML, encoding="utf-8")
    return path


def test_load_providers_returns_all_entries(providers_path: Path) -> None:
    providers = load_providers(providers_path)
    assert [p["id"] for p in providers] == ["google", "github", "microsoft"]
    assert providers[2]["enabled"] is False


def test_set_provider_enabled_flips_flag(providers_path: Path) -> None:
    set_provider_enabled(providers_path, "microsoft", True)
    providers = load_providers(providers_path)
    microsoft = next(p for p in providers if p["id"] == "microsoft")
    assert microsoft["enabled"] is True


def test_set_provider_enabled_preserves_other_entries(providers_path: Path) -> None:
    set_provider_enabled(providers_path, "google", False)
    providers = load_providers(providers_path)
    assert [p["id"] for p in providers] == ["google", "github", "microsoft"]
    google = next(p for p in providers if p["id"] == "google")
    assert google["enabled"] is False


def test_set_provider_enabled_unknown_id_raises(providers_path: Path) -> None:
    with pytest.raises(UnknownProviderError):
        set_provider_enabled(providers_path, "does-not-exist", True)


def test_apply_to_rendered_config_filters_disabled_providers(
    providers_path: Path, rendered_config_path: Path
) -> None:
    apply_to_rendered_config(providers_path, rendered_config_path)

    document = yaml.safe_load(rendered_config_path.read_text(encoding="utf-8"))
    provider_ids = [
        p["id"] for p in document["selfservice"]["methods"]["oidc"]["config"]["providers"]
    ]
    assert provider_ids == ["google", "github"]


def test_apply_to_rendered_config_keeps_all_when_all_enabled(
    tmp_path: Path, rendered_config_path: Path
) -> None:
    all_enabled_path = tmp_path / "all-enabled.yaml"
    all_enabled_path.write_text(
        "providers:\n  - id: google\n    enabled: true\n  - id: github\n    enabled: true\n"
        "  - id: microsoft\n    enabled: true\n",
        encoding="utf-8",
    )

    apply_to_rendered_config(all_enabled_path, rendered_config_path)

    document = yaml.safe_load(rendered_config_path.read_text(encoding="utf-8"))
    provider_ids = [
        p["id"] for p in document["selfservice"]["methods"]["oidc"]["config"]["providers"]
    ]
    assert provider_ids == ["google", "github", "microsoft"]


def test_load_provider_metadata_returns_real_scope_and_label(rendered_config_path: Path) -> None:
    metadata = load_provider_metadata(rendered_config_path)
    assert metadata["google"]["label"] == "Google"
    assert metadata["google"]["scope"] == ["email", "profile", "openid"]
    assert metadata["google"]["client_id_configured"] is True


def test_load_provider_metadata_never_leaks_client_secret(rendered_config_path: Path) -> None:
    metadata = load_provider_metadata(rendered_config_path)
    assert "client_secret" not in metadata["google"]
    assert "client_id" not in metadata["google"]
    for provider in metadata.values():
        assert "super-secret-value" not in str(provider)


def test_load_provider_metadata_falls_back_to_id_when_label_missing(
    rendered_config_path: Path,
) -> None:
    metadata = load_provider_metadata(rendered_config_path)
    assert metadata["github"]["label"] == "github"


def test_load_provider_metadata_missing_file_returns_empty(tmp_path: Path) -> None:
    assert load_provider_metadata(tmp_path / "does-not-exist.yaml") == {}
