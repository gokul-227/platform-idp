// Client for platform/console-api's Theme endpoints. Mirrors
// identity-ui/themes/types.ts's Theme interface field-for-field.

import "server-only";

import { getEnv } from "@/config/env";
import type { Theme } from "@/themes/types";

export async function getTheme(): Promise<Theme | null> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/theme`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as Theme;
  } catch {
    return null;
  }
}

export interface UpdateThemeResult {
  ok: boolean;
  error?: string;
}

export async function updateTheme(theme: Theme): Promise<UpdateThemeResult> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/theme`, {
      body: JSON.stringify(theme),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "PUT",
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

export interface ThemeVersion {
  id: string;
  created_at: string;
}

// Every theme.update snapshots the previous file first (see
// console_api.theme.write_theme) — this is real version history read off
// disk, not a fabricated log.
export async function listThemeHistory(): Promise<ThemeVersion[]> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/theme/history`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { versions?: ThemeVersion[] };
    return body.versions ?? [];
  } catch {
    return [];
  }
}

export async function getThemeVersion(versionId: string): Promise<Theme | null> {
  try {
    const response = await fetch(
      `${getEnv().consoleApiUrl}/api/v1/theme/history/${encodeURIComponent(versionId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as Theme;
  } catch {
    return null;
  }
}

export async function rollbackTheme(versionId: string): Promise<UpdateThemeResult> {
  try {
    const response = await fetch(
      `${getEnv().consoleApiUrl}/api/v1/theme/history/${encodeURIComponent(versionId)}/rollback`,
      { cache: "no-store", method: "POST" },
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
