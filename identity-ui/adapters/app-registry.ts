// Client for platform/app-registry — the Python service that owns every
// write to integrations/applications/*.yaml and the Hydra OAuth2 clients they produce.
// Per the platform's architecture rule, this console never mutates Hydra
// or registry files directly: it calls this service, which does.

import "server-only";

import { getEnv } from "@/config/env";

export interface RegistryAppDefinition {
  filename: string;
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  scope: string;
  enabled: boolean;
  tenant_id: string | null;
  tags: string[];
}

export interface SyncResult {
  client_id: string;
  action: "created" | "updated" | "skipped" | "deleted" | "failed";
  message: string | null;
}

export async function listRegistryApps(): Promise<RegistryAppDefinition[]> {
  const response = await fetch(`${getEnv().appRegistryUrl}/api/v1/registry`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as {
    definitions?: RegistryAppDefinition[];
  };
  return body.definitions ?? [];
}

export interface SetAppEnabledResult {
  ok: boolean;
  syncResult?: SyncResult;
  error?: string;
}

export interface CreateAppInput {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  scope: string;
}

export interface AppMutationResult {
  ok: boolean;
  syncResult?: SyncResult;
  error?: string;
}

export async function createRegistryApp(
  input: CreateAppInput,
): Promise<AppMutationResult> {
  try {
    const response = await fetch(`${getEnv().appRegistryUrl}/api/v1/registry`, {
      body: JSON.stringify({
        client_id: input.clientId,
        client_name: input.clientName,
        redirect_uris: input.redirectUris,
        scope: input.scope,
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as {
      sync_result?: SyncResult;
      error?: string;
    };
    if (!response.ok) {
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true, syncResult: body.sync_result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export interface UpdateAppInput {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  scope: string;
  tags: string[];
}

export async function updateRegistryApp(
  input: UpdateAppInput,
): Promise<AppMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().appRegistryUrl}/api/v1/registry/${encodeURIComponent(input.clientId)}`,
      {
        body: JSON.stringify({
          client_id: input.clientId,
          client_name: input.clientName,
          redirect_uris: input.redirectUris,
          scope: input.scope,
          tags: input.tags,
        }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      sync_result?: SyncResult;
      error?: string;
    };
    if (!response.ok) {
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true, syncResult: body.sync_result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function deleteRegistryApp(clientId: string): Promise<AppMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().appRegistryUrl}/api/v1/registry/${encodeURIComponent(clientId)}`,
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

export async function setAppEnabled(
  clientId: string,
  enabled: boolean,
): Promise<SetAppEnabledResult> {
  try {
    const response = await fetch(
      `${getEnv().appRegistryUrl}/api/v1/registry/${encodeURIComponent(clientId)}/enabled`,
      {
        body: JSON.stringify({ enabled }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json()) as {
      sync_result?: SyncResult;
      error?: string;
    };
    if (!response.ok) {
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true, syncResult: body.sync_result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}
