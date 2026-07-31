// Server-side client for platform/hooks' first-admin bootstrap endpoints —
// the one browser-reachable path that can grant platform-admin without the
// caller already being an admin, and only while zero admins exist yet. See
// platform/hooks/src/hooks_service/main.py's /admin/bootstrap.

import "server-only";

import { getEnv } from "@/config/env";

export async function hasAnyPlatformAdmin(): Promise<boolean> {
  const response = await fetch(`${getEnv().hooksServiceUrl}/admin/bootstrap/status`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`hooks-service bootstrap status check failed: ${response.status}`);
  }
  const body = (await response.json()) as { has_admin: boolean };
  return body.has_admin;
}

export type BootstrapResult =
  | { ok: true }
  | { ok: false; alreadyConfigured: boolean; error: string };

export async function bootstrapPlatformAdmin(identityId: string): Promise<BootstrapResult> {
  const response = await fetch(`${getEnv().hooksServiceUrl}/admin/bootstrap`, {
    body: JSON.stringify({ identity_id: identityId }),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (response.status === 201) {
    return { ok: true };
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return {
    alreadyConfigured: response.status === 409,
    error: body.error ?? `Unexpected status ${response.status}`,
    ok: false,
  };
}

// Ongoing admin management (distinct from the one-time bootstrap above) —
// backs the Administrators console page. Unlike /admin/bootstrap, these two
// require the CALLER to already be a platform admin; that check happens in
// middleware.ts before any /console/* page (including this one) renders at
// all, so by the time these run the caller is already known-authorized.
export async function grantPlatformAdmin(identityId: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${getEnv().hooksServiceUrl}/admin/platform-admins/${encodeURIComponent(identityId)}`, {
    cache: "no-store",
    method: "POST",
  });
  if (response.ok) {
    return { ok: true };
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `Unexpected status ${response.status}`, ok: false };
}

export async function revokePlatformAdmin(identityId: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${getEnv().hooksServiceUrl}/admin/platform-admins/${encodeURIComponent(identityId)}`, {
    cache: "no-store",
    method: "DELETE",
  });
  if (response.ok) {
    return { ok: true };
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `Unexpected status ${response.status}`, ok: false };
}
