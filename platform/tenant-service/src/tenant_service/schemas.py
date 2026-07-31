from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CreateTenantRequest(BaseModel):
    name: str | None = None
    domain: str | None = None


class UpdateTenantRequest(BaseModel):
    """All fields optional; a field left unset (or null) leaves that
    column unchanged — there is no way to clear domain back to null via
    this endpoint, only to set it to a new value."""

    name: str | None = None
    domain: str | None = None
    status: str | None = None


class TenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    domain: str | None
    status: str
    created_at: datetime


class CreateInvitationRequest(BaseModel):
    email: str
    role: str
    expires_in_hours: int = 168


class InvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    role: str
    token: str
    status: str
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None


class AcceptInvitationResponse(BaseModel):
    tenant_id: uuid.UUID
    role: str
    email: str
