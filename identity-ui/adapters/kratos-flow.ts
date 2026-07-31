// Fetches a Kratos self-service flow by id, forwarding the browser's
// session/CSRF cookies server-side, and bounces to Kratos's own
// `/self-service/<kind>/browser` endpoint to mint a fresh flow when the id
// is missing or Kratos rejects it (expired, wrong CSRF, etc.) — Kratos
// itself sets the new flow's cookie on that redirect.
//
// Pattern confirmed against .reference/platform-ory-id-spike/apps/id/
// src/lib/kratos.ts (read-only reference, not copied verbatim — adapted to
// this app's own Env/FlowKind types).

import "server-only";

import {
  Configuration,
  FrontendApi,
  type LoginFlow,
  type RecoveryFlow,
  type RegistrationFlow,
  type Session,
  type SettingsFlow,
  type VerificationFlow,
} from "@ory/client-fetch";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getEnv } from "@/config/env";
import type { BrowserFlow, FlowKind, FlowSearchParams } from "@/types/flow";

// Query params Kratos's own self-service init endpoint understands and
// should be preserved across the mint-a-fresh-flow redirect.
const PASSTHROUGH_PARAMS = ["return_to", "login_challenge", "refresh", "aal"];

function frontendApi(): FrontendApi {
  const { kratosPublicUrl } = getEnv();
  return new FrontendApi(new Configuration({ basePath: kratosPublicUrl }));
}

/**
 * Current session, or null if not authenticated. Pattern confirmed against
 * .reference/platform-ory-id-spike/apps/id/src/lib/kratos.ts's getSession —
 * same toSession() + cookie forwarding, swallowing the 401 into null rather
 * than throwing, since "not logged in" is an expected, common case here.
 */
export async function getSession(): Promise<Session | null> {
  try {
    return await frontendApi().toSession({ cookie: await cookieHeader() });
  } catch {
    return null;
  }
}

/**
 * The identity's *other* active sessions — Kratos deliberately excludes the
 * current one from this list (get that from getSession() instead). Same
 * exclusion behavior confirmed in the reference's listMyOtherSessions.
 */
export async function listMyOtherSessions(): Promise<Session[]> {
  try {
    return await frontendApi().listMySessions({
      cookie: await cookieHeader(),
      pageSize: 50,
    });
  } catch {
    return [];
  }
}

/** Revoke one of the identity's own OTHER sessions (not the current one —
 * Kratos itself refuses that; use the real logout flow instead). */
export interface SimulatedNode {
  group: string;
  type: string;
  label: string | null;
}

// "Simulate" for the Authentication Flow Builder: calls Kratos's real
// native (API-style, no browser cookies/CSRF needed) flow-init endpoint
// for the given type and returns the actual ui.nodes it emits, grouped —
// exactly what a real client would see for the platform's current
// enabled-methods state. Settings flows require an authenticated
// identity_id and aren't simulated here (native settings-flow init isn't
// something Kratos supports without a real session either).
export async function simulateFlow(
  type: "login" | "registration" | "recovery" | "verification",
): Promise<SimulatedNode[] | null> {
  try {
    const api = frontendApi();
    const flow =
      type === "login"
        ? await api.createNativeLoginFlow()
        : type === "registration"
          ? await api.createNativeRegistrationFlow()
          : type === "recovery"
            ? await api.createNativeRecoveryFlow()
            : await api.createNativeVerificationFlow();
    return flow.ui.nodes.map((node) => ({
      group: node.group,
      label: node.meta.label?.text ?? null,
      type: node.attributes.node_type,
    }));
  } catch {
    return null;
  }
}

// @ory/client-fetch (an openapi-generator "fetch" client) throws on any
// non-2xx response — this app doesn't pin down its exact thrown shape
// anywhere else either (every other catch block in this file just
// swallows), so extract defensively: a ResponseError-style `{ response:
// Response }` wrapper, a bare Response, or an already-parsed body are all
// handled, and anything unrecognized falls through to `undefined` rather
// than throwing a second time.
async function kratosErrorId(err: unknown): Promise<string | undefined> {
  try {
    if (err && typeof err === "object") {
      const withResponse = err as { response?: Response };
      if (withResponse.response && typeof withResponse.response.json === "function") {
        const body = (await withResponse.response.json()) as { error?: { id?: string } };
        return body.error?.id;
      }
      if (typeof (err as Partial<Response>).json === "function") {
        const body = (await (err as Response).json()) as { error?: { id?: string } };
        return body.error?.id;
      }
      const bodyLike = err as { error?: { id?: string } };
      if (bodyLike.error?.id) return bodyLike.error.id;
    }
  } catch {
    // Response body already consumed, or genuinely not JSON — fall through.
  }
  return undefined;
}

/**
 * True only when Kratos's own selfservice.flows.registration.enabled is
 * false (see ory/kratos/config/kratos.yaml.tmpl's SELF_REGISTRATION_ENABLED
 * toggle) — confirmed live against the running stack: with the flow
 * disabled, both `GET /self-service/registration/api` (native) and
 * `GET /self-service/registration/browser` (browser) respond
 * `400 {"error":{"id":"self_service_flow_disabled","reason":"Registration
 * is not allowed because it was disabled."}}`. Uses the NATIVE flow init
 * (no browser cookie/CSRF dependency — the same call simulateFlow() above
 * already makes) purely as a side-effect-free disabled/enabled probe: it
 * never touches the real browser-cookie-based flow getBrowserFlow renders,
 * so it can't desync from or interfere with that redirect-based init.
 * Any error OTHER than self_service_flow_disabled is treated as "assume
 * enabled" (fails open to the existing behavior) rather than surfacing a
 * misleading "registration is disabled" message for an unrelated failure
 * (e.g. Kratos genuinely unreachable).
 */
export async function isRegistrationDisabled(): Promise<boolean> {
  try {
    await frontendApi().createNativeRegistrationFlow();
    return false;
  } catch (err) {
    return (await kratosErrorId(err)) === "self_service_flow_disabled";
  }
}

export async function revokeSession(id: string): Promise<void> {
  await frontendApi().disableMySession({
    id,
    cookie: await cookieHeader(),
  });
}

// Kratos's real self-service "sign out everywhere" endpoint — revokes every
// *other* session for the caller's own identity in one call (the current
// session is deliberately excluded by Kratos itself, same as
// listMyOtherSessions above; ending your own current session is what
// Logout is for).
export async function revokeAllMyOtherSessions(): Promise<number> {
  const result = await frontendApi().disableMyOtherSessions({
    cookie: await cookieHeader(),
  });
  return result.count ?? 0;
}

async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function selfServiceInitUrl(kind: FlowKind, params: FlowSearchParams): string {
  const { kratosBrowserUrl } = getEnv();
  const url = new URL(`${kratosBrowserUrl}/self-service/${kind}/browser`);
  for (const key of PASSTHROUGH_PARAMS) {
    const value = params[key];
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchFlow(
  kind: FlowKind,
  id: string,
  cookie: string,
): Promise<BrowserFlow> {
  const api = frontendApi();
  switch (kind) {
    case "login":
      return (await api.getLoginFlow({ id, cookie })) as LoginFlow;
    case "registration":
      return (await api.getRegistrationFlow({ id, cookie })) as RegistrationFlow;
    case "recovery":
      return (await api.getRecoveryFlow({ id, cookie })) as RecoveryFlow;
    case "verification":
      return (await api.getVerificationFlow({ id, cookie })) as VerificationFlow;
    case "settings":
      return (await api.getSettingsFlow({ id, cookie })) as SettingsFlow;
    default:
      throw new Error(`unknown flow kind: ${kind satisfies never}`);
  }
}

/**
 * Resolve a browser-facing Kratos flow for the given kind, given the
 * current request's search params (expects a `flow` id). Redirects to
 * Kratos's own init endpoint (never returns) if the id is missing or the
 * fetch fails for any reason (expired flow, bad CSRF, etc.).
 */
export async function getBrowserFlow(
  kind: FlowKind,
  params: FlowSearchParams,
): Promise<BrowserFlow> {
  const id = params.flow;
  if (!id) {
    redirect(selfServiceInitUrl(kind, params));
  }

  try {
    return await fetchFlow(kind, id, await cookieHeader());
  } catch {
    redirect(selfServiceInitUrl(kind, params));
  }
}
