from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


class FakeEmailProvider:
    def __init__(self, succeed: bool = True) -> None:
        self.succeed = succeed
        self.sent: list[tuple[str, str, str, str]] = []

    async def send_mail(self, to: str, subject: str, html: str, text: str) -> bool:
        self.sent.append((to, subject, html, text))
        return self.succeed


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "false")


@pytest.fixture
def client() -> Iterator[TestClient]:
    from email_service.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "email-service"}


def test_send_missing_fields_returns_400(client: TestClient) -> None:
    response = client.post("/send", json={"to": "a@example.com"})
    assert response.status_code == 400
    assert response.json() == {"error": "Missing to, subject, or message body content"}


def test_send_success(client: TestClient) -> None:
    from email_service.main import app

    fake = FakeEmailProvider(succeed=True)
    app.state.provider = fake

    response = client.post(
        "/send", json={"to": "a@example.com", "subject": "Hi", "text": "Hello there"}
    )
    assert response.status_code == 200
    assert response.json() == {"status": "sent"}
    assert fake.sent == [("a@example.com", "Hi", "", "Hello there")]


def test_send_failure_returns_500(client: TestClient) -> None:
    from email_service.main import app

    app.state.provider = FakeEmailProvider(succeed=False)

    response = client.post(
        "/send", json={"to": "a@example.com", "subject": "Hi", "html": "<p>Hi</p>"}
    )
    assert response.status_code == 500
    assert response.json() == {"error": "Email delivery failed"}
