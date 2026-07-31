// Client for platform/console-api's Identity Providers endpoints. Toggling
// a provider here only edits configuration/identity-providers.yaml — it does NOT
// restart Kratos (no runtime config-reload API in the OSS edition). An
// operator applies the change with `make restart` (which reruns
// config-render + the identity-providers-render step before Kratos
// starts) — see console_api/identity_providers.py's docstring.

import "server-only";

import { getEnv } from "@/config/env";

export interface IdentityProvider {
  id: string;
  enabled: boolean;
  // Real, non-secret metadata read from Kratos's own rendered config —
  // absent entirely if that file wasn't mounted/hasn't rendered yet, never
  // guessed. client_secret is intentionally never exposed by the backend.
  label?: string;
  provider?: string;
  scope?: string[];
  client_id_configured?: boolean;
}

export async function listIdentityProviders(): Promise<IdentityProvider[]> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/identity-providers`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { providers?: IdentityProvider[] };
    return body.providers ?? [];
  } catch {
    return [];
  }
}

export interface SetProviderEnabledResult {
  ok: boolean;
  error?: string;
}

export async function setIdentityProviderEnabled(
  providerId: string,
  enabled: boolean,
): Promise<SetProviderEnabledResult> {
  try {
    const response = await fetch(
      `${getEnv().consoleApiUrl}/api/v1/identity-providers/${encodeURIComponent(providerId)}/enabled`,
      {
        body: JSON.stringify({ enabled }),
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
