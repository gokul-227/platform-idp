"""Payload models for Kratos webhook bodies.

Shapes must match the jsonnet templates that produce them:
ory/kratos/hooks/registration.jsonnet and ory/kratos/hooks/login.jsonnet.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class OrganizationTrait(BaseModel):
    model_config = ConfigDict(extra="allow")

    # Empty at registration time for most identities — organization
    # membership is established later (invite/creation flow), not at signup.
    id: str | None = None
    role: str | None = None


class IdentityTraits(BaseModel):
    model_config = ConfigDict(extra="allow")

    email: str
    username: str | None = None
    name: str | dict[str, str] | None = None
    organization: OrganizationTrait | None = None


class Identity(BaseModel):
    id: str
    schema_id: str
    state: str | None = None
    traits: IdentityTraits


class Session(BaseModel):
    id: str
    active: bool
    expires_at: str | None = None
    issued_at: str | None = None
    authenticated_at: str | None = None
    authenticator_assurance_level: str | None = None
    authentication_methods: list[dict[str, object]] | None = None


class Flow(BaseModel):
    id: str
    type: str
    method: str


class RequestHeaders(BaseModel):
    user_agent: str | None = None
    accept_language: str | None = None
    x_forwarded_for: str | None = None
    x_real_ip: str | None = None


class RegistrationWebhookPayload(BaseModel):
    event: str
    timestamp: str
    identity: Identity
    session: Session | None = None
    flow: Flow


class LoginWebhookPayload(BaseModel):
    event: str
    timestamp: str
    identity: Identity
    session: Session
    flow: Flow
    request_headers: RequestHeaders
