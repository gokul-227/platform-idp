import {
  Configuration,
  type FlowError,
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
import { env } from "./env";

export type FlowType =
  | "login"
  | "registration"
  | "recovery"
  | "verification"
  | "settings";

export type BrowserFlow =
  | LoginFlow
  | RegistrationFlow
  | RecoveryFlow
  | VerificationFlow
  | SettingsFlow;

export type FlowSearchParams = Record<string, string | undefined>;

const frontend = new FrontendApi(
  new Configuration({ basePath: env.kratosPublicUrl })
);

async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

/**
 * Query params Kratos consumes when initializing a self-service flow.
 * `login_challenge` carries the Hydra OAuth2 handoff into the login flow.
 */
const PASSTHROUGH_PARAMS = [
  "return_to",
  "login_challenge",
  "refresh",
  "aal",
  "via",
];

function selfServiceRedirect(type: FlowType, params: FlowSearchParams): never {
  const query = new URLSearchParams();
  for (const key of PASSTHROUGH_PARAMS) {
    const value = params[key];
    if (value) {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`${env.kratosBrowserUrl}/self-service/${type}/browser${suffix}`);
}

function fetchFlow(
  type: FlowType,
  id: string,
  cookie: string
): Promise<BrowserFlow> {
  switch (type) {
    case "login":
      return frontend.getLoginFlow({ id, cookie });
    case "registration":
      return frontend.getRegistrationFlow({ id, cookie });
    case "recovery":
      return frontend.getRecoveryFlow({ id, cookie });
    case "verification":
      return frontend.getVerificationFlow({ id, cookie });
    case "settings":
      return frontend.getSettingsFlow({ id, cookie });
    default:
      return Promise.reject(new Error("unknown flow type"));
  }
}

/** The status Ory answered with, for a client error that carries a response. */
function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/**
 * Resolve `?flow=`, minting a fresh flow through Kratos when it is missing or
 * expired. A 403 is the exception and does not mint: `security_csrf_violation`
 * means this browser did not start the flow, a replacement refuses the same way,
 * and that is the one shape that loops.
 */
export async function getBrowserFlow(
  type: FlowType,
  params: FlowSearchParams
): Promise<BrowserFlow> {
  const id = params.flow;
  if (!id) {
    selfServiceRedirect(type, params);
  }
  try {
    return await fetchFlow(type, id, await cookieHeader());
  } catch (error) {
    const status = statusOf(error);
    if (status === 403) {
      redirect("/unavailable");
    }
    // The reason, or the loop is undiagnosable: a swallowed status leaves the
    // browser bouncing and the log silent about what refused.
    console.warn(
      `[id/kratos] ${type} flow ${id} refused with ${status ?? "no status"}`
    );
    selfServiceRedirect(type, params);
  }
}

/**
 * Null is "no usable session", not "not signed in": a 403 is Kratos declining to
 * describe a session that exists, and a caller cannot tell it from an expired
 * cookie. 401 is ordinary and stays quiet; anything else is logged.
 */
export async function getSession(): Promise<Session | null> {
  try {
    return await frontend.toSession({ cookie: await cookieHeader() });
  } catch (error) {
    const status = statusOf(error);
    if (status && status !== 401) {
      console.warn(`[id/kratos] whoami declined with ${status}`);
    }
    return null;
  }
}

/**
 * The identity's *other* active sessions. Kratos deliberately excludes the
 * current one here; get that from `getSession()` (whoami).
 */
export async function listMyOtherSessions(): Promise<Session[]> {
  try {
    return await frontend.listMySessions({
      cookie: await cookieHeader(),
      pageSize: 50,
    });
  } catch {
    return [];
  }
}

/** Revoke one of the current identity's sessions by id. */
export async function revokeMySession(id: string): Promise<void> {
  await frontend.disableMySession({ cookie: await cookieHeader(), id });
}

/** Revoke every session except the one making this call. */
export async function revokeMyOtherSessions(): Promise<void> {
  await frontend.disableMyOtherSessions({ cookie: await cookieHeader() });
}

export async function getLogoutUrl(): Promise<string | null> {
  try {
    const flow = await frontend.createBrowserLogoutFlow({
      cookie: await cookieHeader(),
    });
    return flow.logout_url;
  } catch {
    return null;
  }
}

export async function getFlowErrorById(id: string): Promise<FlowError | null> {
  try {
    return await frontend.getFlowError({ id });
  } catch {
    return null;
  }
}
