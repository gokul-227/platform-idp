from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CreateAuditEventRequest(BaseModel):
    actor_id: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    metadata: dict[str, object] = {}


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: str | None
    action: str
    resource_type: str
    resource_id: str | None
    metadata_json: dict[str, object]
    created_at: datetime
