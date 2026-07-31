// Logout isn't a self-service "flow" with ui.nodes like the other five —
// Kratos's browser logout is a two-step redirect: fetch a one-time
// logout_url server-side (requires the session cookie, to prove the caller
// actually holds a session), then send the browser to that URL, which
// Kratos itself uses to clear the session cookie and redirect onward. See
// https://www.ory.sh/docs/kratos/self-service/flows/user-logout (browser
// flow) — this route is the entire implementation of that first step.

import { Configuration, FrontendApi } from "@ory/client-fetch";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/config/env";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { kratosPublicUrl } = getEnv();
  const api = new FrontendApi(new Configuration({ basePath: kratosPublicUrl }));
  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const returnTo = request.nextUrl.searchParams.get("return_to") ?? undefined;

  try {
    const { logout_url } = await api.createBrowserLogoutFlow({
      cookie,
      returnTo,
    });
    return NextResponse.redirect(logout_url);
  } catch {
    // No session to log out of (or Kratos rejected the request) — nothing
    // to clear, just send the browser on.
    return NextResponse.redirect(new URL(returnTo ?? "/", request.url));
  }
}
