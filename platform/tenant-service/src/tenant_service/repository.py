from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tenant_service.models import Invitation, Tenant


class TenantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, name: str, domain: str | None) -> Tenant:
        tenant = Tenant(name=name, domain=domain)
        self._session.add(tenant)
        await self._session.commit()
        await self._session.refresh(tenant)
        return tenant

    async def list_all(self) -> list[Tenant]:
        result = await self._session.execute(select(Tenant).order_by(Tenant.created_at.desc()))
        return list(result.scalars().all())

    async def get_by_id(self, tenant_id: uuid.UUID) -> Tenant | None:
        return await self._session.get(Tenant, tenant_id)

    async def update(
        self, tenant_id: uuid.UUID, name: str | None, domain: str | None, status: str | None
    ) -> Tenant | None:
        tenant = await self._session.get(Tenant, tenant_id)
        if tenant is None:
            return None
        if name is not None:
            tenant.name = name
        if domain is not None:
            tenant.domain = domain
        if status is not None:
            tenant.status = status
        await self._session.commit()
        await self._session.refresh(tenant)
        return tenant

    async def delete(self, tenant_id: uuid.UUID) -> bool:
        tenant = await self._session.get(Tenant, tenant_id)
        if tenant is None:
            return False
        await self._session.delete(tenant)
        await self._session.commit()
        return True


class InvitationNotFoundError(Exception):
    def __init__(self, invitation_id: object) -> None:
        super().__init__(f"Unknown invitation: {invitation_id}")


class InvitationExpiredError(Exception):
    pass


class InvitationAlreadyResolvedError(Exception):
    pass


class InvitationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, tenant_id: uuid.UUID, email: str, role: str, expires_in_hours: int
    ) -> Invitation:
        invitation = Invitation(
            email=email,
            expires_at=datetime.now(UTC) + timedelta(hours=expires_in_hours),
            role=role,
            tenant_id=tenant_id,
            token=secrets.token_urlsafe(32),
        )
        self._session.add(invitation)
        await self._session.commit()
        await self._session.refresh(invitation)
        return invitation

    async def list_for_tenant(self, tenant_id: uuid.UUID) -> list[Invitation]:
        result = await self._session.execute(
            select(Invitation)
            .where(Invitation.tenant_id == tenant_id)
            .order_by(Invitation.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, invitation_id: uuid.UUID) -> Invitation | None:
        return await self._session.get(Invitation, invitation_id)

    async def get_by_token(self, token: str) -> Invitation | None:
        result = await self._session.execute(select(Invitation).where(Invitation.token == token))
        return result.scalar_one_or_none()

    async def revoke(self, invitation_id: uuid.UUID) -> Invitation:
        invitation = await self._session.get(Invitation, invitation_id)
        if invitation is None:
            raise InvitationNotFoundError(invitation_id)
        invitation.status = "revoked"
        await self._session.commit()
        await self._session.refresh(invitation)
        return invitation

    async def accept(self, token: str) -> Invitation:
        invitation = await self.get_by_token(token)
        if invitation is None:
            raise InvitationNotFoundError(token)
        if invitation.status != "pending":
            raise InvitationAlreadyResolvedError
        if invitation.expires_at < datetime.now(UTC):
            invitation.status = "expired"
            await self._session.commit()
            raise InvitationExpiredError
        invitation.status = "accepted"
        invitation.accepted_at = datetime.now(UTC)
        await self._session.commit()
        await self._session.refresh(invitation)
        return invitation
