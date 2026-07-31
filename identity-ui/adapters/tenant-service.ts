// Client for platform/tenant-service — the existing multi-tenancy CRUD
// service (Postgres-backed). Organizations in the console are this
// service's tenants; membership/roles are Keto Organization relation
// tuples (admin/member/billing_admin — see adapters/console-api.ts's
// createRelationTuple/deleteRelationTuple, already proven out by the
// Permissions page). Reusing both existing mechanisms, not inventing a
// third.

import "server-only";

import { getEnv } from "@/config/env";

export interface Tenant {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
}

export async function listTenants(): Promise<Tenant[]> {
  try {
    const response = await fetch(`${getEnv().tenantServiceUrl}/tenants`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    return (await response.json()) as Tenant[];
  } catch {
    return [];
  }
}

export async function getTenant(id: string): Promise<Tenant | null> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/tenants/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as Tenant;
  } catch {
    return null;
  }
}

export interface CreateTenantResult {
  ok: boolean;
  error?: string;
}

export async function renameTenant(
  id: string,
  name: string,
): Promise<CreateTenantResult> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/tenants/${encodeURIComponent(id)}`,
      {
        body: JSON.stringify({ name }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function deleteTenant(id: string): Promise<CreateTenantResult> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/tenants/${encodeURIComponent(id)}`,
      { cache: "no-store", method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export async function listInvitations(tenantId: string): Promise<Invitation[]> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/tenants/${encodeURIComponent(tenantId)}/invitations`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    return (await response.json()) as Invitation[];
  } catch {
    return [];
  }
}

export interface InvitationMutationResult {
  ok: boolean;
  invitation?: Invitation;
  error?: string;
}

export async function createInvitation(
  tenantId: string,
  email: string,
  role: string,
): Promise<InvitationMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/tenants/${encodeURIComponent(tenantId)}/invitations`,
      {
        body: JSON.stringify({ email, role }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json().catch(() => ({}))) as Invitation | { error?: string };
    if (!response.ok) {
      const error = "error" in body ? body.error : undefined;
      return { error: error ?? `HTTP ${response.status}`, ok: false };
    }
    return { invitation: body as Invitation, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function revokeInvitation(
  tenantId: string,
  invitationId: string,
): Promise<CreateTenantResult> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/tenants/${encodeURIComponent(tenantId)}/invitations/${encodeURIComponent(invitationId)}`,
      { cache: "no-store", method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export interface AcceptInvitationResult {
  ok: boolean;
  tenantId?: string;
  role?: string;
  email?: string;
  error?: string;
}

export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  try {
    const response = await fetch(
      `${getEnv().tenantServiceUrl}/invitations/${encodeURIComponent(token)}/accept`,
      { cache: "no-store", method: "POST" },
    );
    const body = (await response.json().catch(() => ({}))) as
      | { tenant_id: string; role: string; email: string }
      | { error?: string };
    if (!response.ok) {
      const error = "error" in body ? body.error : undefined;
      return { error: error ?? `HTTP ${response.status}`, ok: false };
    }
    const accepted = body as { tenant_id: string; role: string; email: string };
    return { email: accepted.email, ok: true, role: accepted.role, tenantId: accepted.tenant_id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function createTenant(
  name: string,
  domain?: string,
): Promise<CreateTenantResult> {
  try {
    const response = await fetch(`${getEnv().tenantServiceUrl}/tenants`, {
      body: JSON.stringify({ domain: domain || undefined, name }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}
