from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from notification_service.audit_client import AuditClient


class FakeAuditClient(AuditClient):
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    async def record(
        self,
        logger: Any,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        actor_id: str | None = None,
    ) -> None:
        self.events.append(
            {"action": action, "resource_type": resource_type, "resource_id": resource_id}
        )

    async def aclose(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "false")
    monkeypatch.setenv("EMAIL_TEMPLATES_PATH", str(tmp_path / "email-templates"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    from notification_service.main import app

    with TestClient(app) as test_client:
        app.state.audit = FakeAuditClient()
        yield test_client


def _install_email_transport(client: TestClient, handler: Any) -> None:
    from notification_service.main import app

    app.state.http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "notification-service"}


def test_dispatch_missing_fields_returns_400(client: TestClient) -> None:
    response = client.post("/dispatch", json={"recipient": "a@example.com"})
    assert response.status_code == 400
    assert response.json() == {"error": "Missing recipient, channel, or message"}


def test_dispatch_unsupported_channel_returns_400(client: TestClient) -> None:
    response = client.post(
        "/dispatch", json={"recipient": "a@example.com", "channel": "push", "message": "hi"}
    )
    assert response.status_code == 400
    assert response.json() == {"error": "Unsupported channel: push"}


def test_dispatch_sms_is_mocked_success(client: TestClient) -> None:
    response = client.post(
        "/dispatch", json={"recipient": "+15551234567", "channel": "sms", "message": "hi"}
    )
    assert response.status_code == 200
    assert response.json() == {"status": "dispatched", "channel": "sms"}


def test_dispatch_email_success_escapes_html(client: TestClient) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"status": "sent"})

    _install_email_transport(client, handler)

    response = client.post(
        "/dispatch",
        json={
            "recipient": "a@example.com",
            "channel": "email",
            "message": "<script>alert(1)</script>",
            "title": "Alert",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"status": "dispatched", "channel": "email"}
    assert captured["body"]["html"] == "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
    assert captured["body"]["text"] == "<script>alert(1)</script>"
    assert captured["body"]["subject"] == "Alert"


def test_dispatch_email_default_subject(client: TestClient) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "sent"})

    _install_email_transport(client, handler)

    response = client.post(
        "/dispatch", json={"recipient": "a@example.com", "channel": "email", "message": "hi"}
    )
    assert response.status_code == 200


def test_dispatch_email_failure_returns_500(client: TestClient) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    _install_email_transport(client, handler)

    response = client.post(
        "/dispatch", json={"recipient": "a@example.com", "channel": "email", "message": "hi"}
    )
    assert response.status_code == 500
    assert response.json() == {"error": "Notification routing failed"}


@pytest.fixture
def seeded_templates(tmp_path: Path) -> Path:
    templates_dir = tmp_path / "email-templates"
    recovery_dir = templates_dir / "recovery"
    recovery_dir.mkdir(parents=True)
    (recovery_dir / "valid.subject.gotmpl").write_text("Recover your account", encoding="utf-8")
    (recovery_dir / "valid.html.gotmpl").write_text("<p>Click here</p>", encoding="utf-8")
    return templates_dir


def test_list_templates(client: TestClient, seeded_templates: Path) -> None:
    response = client.get("/api/v1/notifications/templates")
    assert response.status_code == 200
    templates = response.json()["templates"]
    ids = {t["id"] for t in templates}
    assert ids == {"recovery.valid.subject", "recovery.valid.html"}


def test_get_one_template(client: TestClient, seeded_templates: Path) -> None:
    response = client.get("/api/v1/notifications/templates/recovery.valid.subject")
    assert response.status_code == 200
    assert response.json()["content"] == "Recover your account"


def test_get_one_template_unknown_404s(client: TestClient, seeded_templates: Path) -> None:
    response = client.get("/api/v1/notifications/templates/does.not.exist")
    assert response.status_code == 404


def test_put_template_updates_real_file(client: TestClient, seeded_templates: Path) -> None:
    response = client.put(
        "/api/v1/notifications/templates/recovery.valid.subject",
        json={"content": "Reset your NeoBIM password"},
    )
    assert response.status_code == 200
    assert response.json()["content"] == "Reset your NeoBIM password"

    on_disk = (seeded_templates / "recovery" / "valid.subject.gotmpl").read_text(encoding="utf-8")
    assert on_disk == "Reset your NeoBIM password"


def test_put_template_unknown_404s(client: TestClient, seeded_templates: Path) -> None:
    response = client.put("/api/v1/notifications/templates/does.not.exist", json={"content": "x"})
    assert response.status_code == 404


def test_put_template_records_audit_event(client: TestClient, seeded_templates: Path) -> None:
    from notification_service.main import app

    client.put(
        "/api/v1/notifications/templates/recovery.valid.subject", json={"content": "New subject"}
    )

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {
            "action": "notification.template.update",
            "resource_type": "notification_template",
            "resource_id": "recovery.valid.subject",
        }
    ]


def test_test_send_dispatches_real_email_and_records_audit(client: TestClient) -> None:
    from notification_service.main import app

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "sent"})

    _install_email_transport(client, handler)

    response = client.post("/api/v1/notifications/test", json={"recipient": "test@example.com"})
    assert response.status_code == 200

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {
            "action": "notification.test.send",
            "resource_type": "notification",
            "resource_id": "test@example.com",
        }
    ]
