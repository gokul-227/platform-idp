import { type NextRequest, NextResponse } from "next/server";
import { isPlatformAuthConfigured, platformAuth } from "@/lib/platform.auth";
import { createStaffSessionGuard } from "@/lib/staff.guard";

/**
 * The console's gate: a staff identity on the `staff` schema, with a known
 * `staffRole`, at aal2. Nothing reaches the app around it, because the service
 * takes load-balancer ingress only and its *.run.app URL 404s. IAM cannot be the
 * control: the load balancer forwards without a caller identity.
 */

/**
 * `/denied` must answer without a session and `/logout` is the way out of a wrong
 * one. `/api` authenticates itself: the relay by the platform token it attaches,
 * `api/internal` per route. Written out because Next parses this statically and
 * accepts only literal strings.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|denied|logout|api).*)"],
};

const staff = createStaffSessionGuard();

/**
 * Staff session first, then a platform token for the same person, so every page
 * can read the estate through the relay. `/auth/*` is that round trip itself.
 * A token whose subject is not the identity just admitted was left behind by
 * whoever signed in before; it goes, and the round trip runs for this person.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const admission = await staff(request);
  if (
    admission.status !== 200 ||
    request.nextUrl.pathname.startsWith("/auth/") ||
    !isPlatformAuthConfigured()
  ) {
    return admission;
  }
  const token = platformAuth.sessionOf(request);
  if (token && admission.subject && token.subject !== admission.subject) {
    const login = new URL("/auth/login", request.nextUrl.origin);
    login.searchParams.set(
      "return_to",
      request.nextUrl.pathname + request.nextUrl.search
    );
    const response = NextResponse.redirect(login);
    platformAuth.clearSession(response);
    return response;
  }
  return platformAuth.guard(request);
}
