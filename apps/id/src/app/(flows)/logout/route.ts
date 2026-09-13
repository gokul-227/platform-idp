import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { hydraAdmin } from "@/lib/hydra";
import { getLogoutUrl, getSession } from "@/lib/kratos";
import { platformAuth } from "@/lib/platform.auth";

/**
 * Kratos logout needs a per-session token, so fetch it server-side and bounce to
 * the tokenized URL. Every OAuth grant goes first, subject-wide: ending the Kratos
 * session ends this host's and nothing else. Not back-channel logout, which cannot
 * reach a cookie in a browser it is not talking to (#53).
 *
 * A failure here does not stop the sign-out, and grants stay revocable per
 * application from the account page.
 */
export async function GET(): Promise<NextResponse> {
  const subject = (await getSession())?.identity?.id;
  if (subject) {
    try {
      // Both, because either alone leaves half a session standing. The consent
      // sessions are the grants and the refresh tokens; the login session is
      // Hydra still remembering who this browser is, which is what lets a fresh
      // authorization skip the login leg entirely.
      await Promise.all([
        hydraAdmin.revokeOAuth2ConsentSessions({ all: true, subject }),
        hydraAdmin.revokeOAuth2LoginSessions({ subject }),
      ]);
    } catch (error) {
      console.warn(
        `[id/logout] revoking sessions for ${subject} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }
  const logoutUrl = await getLogoutUrl();
  const response = NextResponse.redirect(
    logoutUrl ?? new URL("/login", env.appUrl)
  );
  // The grants above are gone; the cookies naming them go with the person.
  platformAuth.clearSession(response);
  return response;
}
