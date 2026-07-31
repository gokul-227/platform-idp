// A plain Route Handler rather than a "use server" Server Action —
// deliberately, after confirming live that a Server Action's redirect()
// here raced ahead of the client-side transition re-running middleware.
import { NextResponse, type NextRequest } from "next/server";

import { isPlatformAdmin } from "@/adapters/admin";
import { bootstrapPlatformAdmin } from "@/adapters/hooks-service";
import { getSession } from "@/adapters/kratos-flow";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A relative path, deliberately NOT built from `request.nextUrl.clone()` —
// confirmed live that doing so produces an absolute Location header using
// this container's own bind address (`http://0.0.0.0:3000/console`, from
// this service's HOSTNAME=0.0.0.0 override) instead of the real external
// host Oathkeeper forwarded, which the browser then can't reach at all
// (net::ERR_CONNECTION_REFUSED). A bare relative Location header sidesteps
// host resolution entirely — every browser resolves it against the current
// origin, which is the real one the user is actually on.
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { headers: { Location: path }, status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  const identityId = session?.identity?.id;
  if (!identityId) {
    return redirectTo("/auth/login?return_to=%2Fauth%2Fsetup");
  }

  const result = await bootstrapPlatformAdmin(identityId);
  if (!result.ok) {
    return redirectTo(
      result.alreadyConfigured
        ? "/auth/setup?already_configured=1"
        : `/auth/setup?error=${encodeURIComponent(result.error)}`,
    );
  }

  // hooks-service's 201 confirms the write; poll the same check middleware
  // uses before redirecting, so /console is guaranteed consistent. In
  // practice this resolves on the very first check (confirmed live) — the
  // loop is a bounded safety margin, not an expected steady-state wait.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await isPlatformAdmin(identityId)) {
      break;
    }
    await sleep(100);
  }

  return redirectTo("/auth/console");
}
