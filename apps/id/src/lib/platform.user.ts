import "server-only";

import { redirect } from "next/navigation";
import { getSession } from "./kratos";
import { isPlatformAuthConfigured, platformAuth } from "./platform.auth";

/**
 * The gate every tenancy page passes: a Kratos session, then a platform token
 * for the same person, obtained through the silent authorization round trip if
 * this browser holds none. Reads and writes then happen in the browser through
 * the relay, which renews the token itself.
 */

const AUTHORIZING = "authorizing";

export type PlatformGate =
  | { ok: true }
  | { unavailable: "unconfigured" | "unauthorized" };

export async function platformGate(
  path: string,
  searchParams?: Record<string, string | string[] | undefined>
): Promise<PlatformGate> {
  const identity = (await getSession())?.identity?.id;
  if (!identity) {
    // Kratos owns sign-in; there is nobody to hold a platform token for yet.
    redirect(`/login?return_to=${encodeURIComponent(path)}`);
  }
  if (!isPlatformAuthConfigured()) {
    return { unavailable: "unconfigured" };
  }
  const session = await platformAuth.getSession();
  if (session?.accessToken && session.subject === identity) {
    return { ok: true };
  }
  // Once: a deployment where the cookie is written but not returned would
  // otherwise loop forever, and an infinite redirect shows nothing to act on.
  if (searchParams?.[AUTHORIZING]) {
    return { unavailable: "unauthorized" };
  }
  const returnTo = `${path}${path.includes("?") ? "&" : "?"}${AUTHORIZING}=1`;
  redirect(`/auth/login?return_to=${encodeURIComponent(returnTo)}`);
}
