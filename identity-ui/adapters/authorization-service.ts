// Client for platform/authorization-service's Roles/Policies control-plane.
// Policies are real Keto relation tuples — this adapter never stores
// anything of its own, it just calls the Python service that talks to Keto.

import "server-only";

import { getEnv } from "@/config/env";

export interface Role {
  id: string;
  name: string;
  namespace: string;
  relation: string;
  description: string;
}

export interface Policy {
  id: string;
  role_id: string;
  role_name: string;
  namespace: string;
  relation: string;
  object: string;
  subject_id: string;
}

export interface AuthorizationMutationResult {
  ok: boolean;
  error?: string;
}

export async function listRoles(): Promise<Role[]> {
  try {
    const response = await fetch(`${getEnv().authorizationServiceUrl}/api/v1/roles`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { roles?: Role[] };
    return body.roles ?? [];
  } catch {
    return [];
  }
}

export async function getRoleNamespaces(): Promise<Record<string, string[]>> {
  try {
    const response = await fetch(
      `${getEnv().authorizationServiceUrl}/api/v1/roles/namespaces`,
      { cache: "no-store" },
    );
    if (!response.ok) return {};
    return (await response.json()) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export async function createRole(role: Role): Promise<AuthorizationMutationResult> {
  return mutate("/api/v1/roles", "POST", role);
}

export async function deleteRole(roleId: string): Promise<AuthorizationMutationResult> {
  return mutate(`/api/v1/roles/${encodeURIComponent(roleId)}`, "DELETE");
}

export async function listPolicies(roleId?: string): Promise<Policy[]> {
  try {
    const query = roleId ? `?role_id=${encodeURIComponent(roleId)}` : "";
    const response = await fetch(
      `${getEnv().authorizationServiceUrl}/api/v1/policies${query}`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { policies?: Policy[] };
    return body.policies ?? [];
  } catch {
    return [];
  }
}

export async function createPolicy(
  roleId: string,
  objectId: string,
  subjectId: string,
): Promise<AuthorizationMutationResult> {
  return mutate("/api/v1/policies", "POST", {
    object_id: objectId,
    role_id: roleId,
    subject_id: subjectId,
  });
}

export async function deletePolicy(policyId: string): Promise<AuthorizationMutationResult> {
  return mutate(`/api/v1/policies/${encodeURIComponent(policyId)}`, "DELETE");
}

async function mutate(
  path: string,
  method: string,
  body?: unknown,
): Promise<AuthorizationMutationResult> {
  try {
    const response = await fetch(`${getEnv().authorizationServiceUrl}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      method,
    });
    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: parsed.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}
