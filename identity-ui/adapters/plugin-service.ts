// Client for platform/plugin-service — the generic plugin registry.
// Distinct from platform/plugin-framework (a code-loading strategy
// pattern for swapping implementations like email providers, never
// exposed to this app).

import "server-only";

import { getEnv } from "@/config/env";

export const PLUGIN_TYPES = [
  "authentication",
  "identity-provider",
  "theme",
  "notification",
  "application",
  "policy",
  "workflow",
] as const;

export interface Plugin {
  id: string;
  name: string;
  type: string;
  version: string;
  enabled: boolean;
  order: number;
  dependencies: string[];
  config: Record<string, unknown>;
  source: "config" | "code";
  description: string;
  documentation_url: string;
  icon_url: string;
}

export async function listPlugins(): Promise<Plugin[]> {
  try {
    const response = await fetch(`${getEnv().pluginServiceUrl}/api/v1/plugins`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { plugins?: Plugin[] };
    return body.plugins ?? [];
  } catch {
    return [];
  }
}

export interface PluginMutationResult {
  ok: boolean;
  error?: string;
}

export async function createPlugin(plugin: {
  id: string;
  name: string;
  type: string;
  dependencies?: string[];
  description?: string;
  documentation_url?: string;
  icon_url?: string;
}): Promise<PluginMutationResult> {
  try {
    const response = await fetch(`${getEnv().pluginServiceUrl}/api/v1/plugins`, {
      body: JSON.stringify(plugin),
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

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
): Promise<PluginMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().pluginServiceUrl}/api/v1/plugins/${encodeURIComponent(pluginId)}/${enabled ? "enable" : "disable"}`,
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

export interface PluginVersion {
  id: string;
  created_at: string;
}

export async function listPluginHistory(pluginId: string): Promise<PluginVersion[]> {
  try {
    const response = await fetch(
      `${getEnv().pluginServiceUrl}/api/v1/plugins/${encodeURIComponent(pluginId)}/history`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { versions?: PluginVersion[] };
    return body.versions ?? [];
  } catch {
    return [];
  }
}

export async function rollbackPlugin(
  pluginId: string,
  versionId: string,
): Promise<PluginMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().pluginServiceUrl}/api/v1/plugins/${encodeURIComponent(pluginId)}/history/${encodeURIComponent(versionId)}/rollback`,
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

export async function deletePlugin(pluginId: string): Promise<PluginMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().pluginServiceUrl}/api/v1/plugins/${encodeURIComponent(pluginId)}`,
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
