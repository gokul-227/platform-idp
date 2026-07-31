// Client for platform/flow-service. See its README for the real Kratos
// constraint this works around: method enablement is global, not
// per-flow-type, so "publish" is deliberately enable-only.

import "server-only";

import { getEnv } from "@/config/env";

export const FLOW_TYPES = [
  "login",
  "registration",
  "recovery",
  "verification",
  "settings",
] as const;

export const KNOWN_METHODS = [
  "password",
  "oidc",
  "passkey",
  "webauthn",
  "totp",
  "lookup_secret",
  "code",
  "link",
] as const;

export interface Flow {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  steps: string[];
}

export async function listFlows(): Promise<Flow[]> {
  try {
    const response = await fetch(`${getEnv().flowServiceUrl}/api/v1/flows`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { flows?: Flow[] };
    return body.flows ?? [];
  } catch {
    return [];
  }
}

export interface FlowMutationResult {
  ok: boolean;
  error?: string;
  enabledMethods?: string[];
}

export async function createFlow(flow: {
  id: string;
  name: string;
  type: string;
  steps: string[];
}): Promise<FlowMutationResult> {
  try {
    const response = await fetch(`${getEnv().flowServiceUrl}/api/v1/flows`, {
      body: JSON.stringify(flow),
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

export async function setFlowEnabled(
  flowId: string,
  enabled: boolean,
): Promise<FlowMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().flowServiceUrl}/api/v1/flows/${encodeURIComponent(flowId)}/${enabled ? "enable" : "disable"}`,
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

export async function deleteFlow(flowId: string): Promise<FlowMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().flowServiceUrl}/api/v1/flows/${encodeURIComponent(flowId)}`,
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

export interface FlowVersion {
  id: string;
  created_at: string;
}

export async function listFlowHistory(flowId: string): Promise<FlowVersion[]> {
  try {
    const response = await fetch(
      `${getEnv().flowServiceUrl}/api/v1/flows/${encodeURIComponent(flowId)}/history`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { versions?: FlowVersion[] };
    return body.versions ?? [];
  } catch {
    return [];
  }
}

export async function rollbackFlow(
  flowId: string,
  versionId: string,
): Promise<FlowMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().flowServiceUrl}/api/v1/flows/${encodeURIComponent(flowId)}/history/${encodeURIComponent(versionId)}/rollback`,
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

export async function publishFlow(flowId: string): Promise<FlowMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().flowServiceUrl}/api/v1/flows/${encodeURIComponent(flowId)}/publish`,
      { cache: "no-store", method: "POST" },
    );
    const body = (await response.json().catch(() => ({}))) as {
      enabled_methods?: string[];
      error?: string;
    };
    if (!response.ok) {
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { enabledMethods: body.enabled_methods, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}
