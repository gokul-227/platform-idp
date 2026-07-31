// Client for platform/notification-service's template editor + test-send.
// Templates are the real .gotmpl files Kratos's own courier reads — no
// separate copy, no restart needed to take effect.

import "server-only";

import { getEnv } from "@/config/env";

export interface NotificationTemplate {
  id: string;
  flow: string;
  state: string;
  kind: string;
  content: string;
}

export async function listTemplates(): Promise<NotificationTemplate[]> {
  try {
    const response = await fetch(
      `${getEnv().notificationServiceUrl}/api/v1/notifications/templates`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { templates?: NotificationTemplate[] };
    return body.templates ?? [];
  } catch {
    return [];
  }
}

export async function getTemplate(id: string): Promise<NotificationTemplate | null> {
  try {
    const response = await fetch(
      `${getEnv().notificationServiceUrl}/api/v1/notifications/templates/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as NotificationTemplate;
  } catch {
    return null;
  }
}

export interface NotificationMutationResult {
  ok: boolean;
  error?: string;
}

export async function updateTemplate(
  id: string,
  content: string,
): Promise<NotificationMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().notificationServiceUrl}/api/v1/notifications/templates/${encodeURIComponent(id)}`,
      {
        body: JSON.stringify({ content }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "PUT",
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

export async function sendTestNotification(
  recipient: string,
): Promise<NotificationMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().notificationServiceUrl}/api/v1/notifications/test`,
      {
        body: JSON.stringify({ recipient }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
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
