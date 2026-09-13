import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { hydraAdmin } from "@/lib/hydra";
import { platformAuth } from "@/lib/platform.auth";
import { getLogoutUrl, getSession } from "@/lib/session";

/**
 * One sign-out: Hydra's grants and login session for this person, this app's
 * platform token, then the Kratos session. Lands on the id app's login page
 * with this console as the way back, so signing in again returns here.
 */
export async function GET(): Promise<NextResponse> {
  const subject = (await getSession())?.identity?.id;
  if (subject) {
    try {
      await Promise.all([
        hydraAdmin.revokeOAuth2ConsentSessions({ all: true, subject }),
        hydraAdmin.revokeOAuth2LoginSessions({ subject }),
      ]);
    } catch (error) {
      console.warn(
        `[console/logout] revoking sessions for ${subject} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }
  const back = new URL("/login", env.idAppUrl);
  back.searchParams.set("return_to", `${env.consoleUrl}/`);
  const logoutUrl = await getLogoutUrl();
  let target = back.toString();
  if (logoutUrl) {
    const url = new URL(logoutUrl);
    url.searchParams.set("return_to", back.toString());
    target = url.toString();
  }
  const response = NextResponse.redirect(target);
  platformAuth.clearSession(response);
  return response;
}
