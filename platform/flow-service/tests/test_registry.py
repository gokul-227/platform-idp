from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from flow_service.registry import (
    FlowDefinition,
    FlowNotFoundError,
    FlowVersionNotFoundError,
    delete_flow,
    get_flow,
    list_flow_history,
    list_flows,
    methods_to_enable,
    publish_to_rendered_config,
    rollback_flow,
    write_flow,
)

RENDERED_KRATOS_YAML = """\
selfservice:
  methods:
    password:
      enabled: true
    oidc:
      enabled: true
      config:
        providers: []
    code:
      enabled: false
"""


@pytest.fixture
def rendered_config_path(tmp_path: Path) -> Path:
    path = tmp_path / "kratos.yaml"
    path.write_text(RENDERED_KRATOS_YAML, encoding="utf-8")
    return path


def test_write_and_read_roundtrip(tmp_path: Path) -> None:
    definition = FlowDefinition(
        id="standard-login", name="Standard Login", type="login", steps=["password", "code"]
    )
    write_flow(tmp_path, definition)

    loaded = get_flow(tmp_path, "standard-login")
    assert loaded.steps == ["password", "code"]
    assert loaded.enabled is True


def test_get_flow_unknown_raises(tmp_path: Path) -> None:
    with pytest.raises(FlowNotFoundError):
        get_flow(tmp_path, "does-not-exist")


def test_delete_flow_removes_file(tmp_path: Path) -> None:
    write_flow(tmp_path, FlowDefinition(id="a", name="A", type="login"))
    delete_flow(tmp_path, "a")
    assert list_flows(tmp_path) == []


def test_delete_flow_unknown_raises(tmp_path: Path) -> None:
    with pytest.raises(FlowNotFoundError):
        delete_flow(tmp_path, "does-not-exist")


def test_methods_to_enable_only_counts_enabled_flows(tmp_path: Path) -> None:
    write_flow(
        tmp_path,
        FlowDefinition(id="a", name="A", type="login", enabled=True, steps=["password", "totp"]),
    )
    write_flow(
        tmp_path,
        FlowDefinition(id="b", name="B", type="registration", enabled=False, steps=["oidc"]),
    )

    methods = methods_to_enable(tmp_path)
    assert methods == {"password", "totp"}


def test_publish_enables_referenced_methods_without_disabling_others(
    tmp_path: Path, rendered_config_path: Path
) -> None:
    flows_dir = tmp_path / "flows"
    write_flow(flows_dir, FlowDefinition(id="a", name="A", type="login", steps=["totp", "code"]))

    enabled = publish_to_rendered_config(flows_dir, rendered_config_path)
    assert enabled == {"totp", "code"}

    document = yaml.safe_load(rendered_config_path.read_text(encoding="utf-8"))
    methods = document["selfservice"]["methods"]
    assert methods["totp"]["enabled"] is True
    assert methods["code"]["enabled"] is True
    # Never auto-disabled — password/oidc were already true and stay true;
    # this is the enable-only guarantee the README documents.
    assert methods["password"]["enabled"] is True
    assert methods["oidc"]["enabled"] is True
    # oidc's existing config (providers list) survives untouched.
    assert methods["oidc"]["config"] == {"providers": []}


def test_write_flow_creates_history_version_on_update(tmp_path: Path) -> None:
    write_flow(tmp_path, FlowDefinition(id="a", name="A", type="login", steps=["password"]))
    write_flow(tmp_path, FlowDefinition(id="a", name="A Renamed", type="login", steps=["totp"]))

    history = list_flow_history(tmp_path, "a")
    assert len(history) == 1


def test_write_flow_first_time_creates_no_history(tmp_path: Path) -> None:
    write_flow(tmp_path, FlowDefinition(id="a", name="A", type="login", steps=["password"]))
    assert list_flow_history(tmp_path, "a") == []


def test_rollback_flow_restores_previous_version(tmp_path: Path) -> None:
    write_flow(tmp_path, FlowDefinition(id="a", name="A", type="login", steps=["password"]))
    write_flow(tmp_path, FlowDefinition(id="a", name="A Renamed", type="login", steps=["totp"]))
    version_id = list_flow_history(tmp_path, "a")[0]["id"]

    restored = rollback_flow(tmp_path, "a", version_id)
    assert restored.name == "A"
    assert get_flow(tmp_path, "a").name == "A"


def test_rollback_unknown_flow_version_raises(tmp_path: Path) -> None:
    write_flow(tmp_path, FlowDefinition(id="a", name="A", type="login", steps=["password"]))
    with pytest.raises(FlowVersionNotFoundError):
        rollback_flow(tmp_path, "a", "does-not-exist")
