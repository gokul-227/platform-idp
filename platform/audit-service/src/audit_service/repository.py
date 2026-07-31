from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from audit_service.models import AuditEvent


class AuditEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        actor_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None,
        metadata: dict[str, object],
    ) -> AuditEvent:
        event = AuditEvent(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=metadata,
        )
        self._session.add(event)
        await self._session.commit()
        await self._session.refresh(event)
        return event

    async def list_all(
        self,
        resource_type: str | None = None,
        resource_id: str | None = None,
        action: str | None = None,
        limit: int = 200,
    ) -> list[AuditEvent]:
        query = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
        if resource_type:
            query = query.where(AuditEvent.resource_type == resource_type)
        if resource_id:
            query = query.where(AuditEvent.resource_id == resource_id)
        if action:
            query = query.where(AuditEvent.action == action)
        result = await self._session.execute(query)
        return list(result.scalars().all())
