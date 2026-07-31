// Read-only client for platform/audit-service. console-api is the only
// writer (see its audit_client.py) — this app only displays events.

import "server-only";

import { getEnv } from "@/config/env";

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export async function listAuditEvents(filters: {
  resourceType?: string;
  resourceId?: string;
  action?: string;
}): Promise<AuditEvent[]> {
  try {
    const query = new URLSearchParams();
    if (filters.resourceType) query.set("resource_type", filters.resourceType);
    if (filters.resourceId) query.set("resource_id", filters.resourceId);
    if (filters.action) query.set("action", filters.action);
    const response = await fetch(
      `${getEnv().auditServiceUrl}/api/v1/events?${query.toString()}`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    return (await response.json()) as AuditEvent[];
  } catch {
    return [];
  }
}
