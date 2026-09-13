import { Configuration, FrontendApi, type Session } from "@ory/client-fetch";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * The operator's own session, read from Kratos's public API. Separate from
 * `kratos.admin.ts`: this is the console asking who is using it, not the
 * console acting on someone else's identity.
 *
 * `proxy.ts` has already required a staff identity at aal2 by the time any
 * page renders, so a null here means the session ended mid-visit.
 */
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

export async function getSession(): Promise<Session | null> {
  try {
    return await frontend.toSession({ cookie: await cookieHeader() });
  } catch {
    return null;
  }
}

/** Kratos needs a per-session token to log out; only it can mint one. */
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
