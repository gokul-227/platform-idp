import { NextResponse, type NextRequest } from "next/server";

// Gates the Admin Portal (/console/*) BEFORE any page component runs.
//
// Doing this check only in app/console/layout.tsx was tried first and is
// insufficient: Next's App Router renders every matched page.tsx (the
// child route segment) in parallel with its layout — a layout receives
// `children` as an already-executed React element and can only choose how
// to arrange it, not whether the page component's own code (here, real
// Kratos/Hydra/Keto admin API calls) ran at all. Confirmed live: a
// non-admin hitting /console got a visible 403, but the response body's
// RSC flight payload still contained the real Overview page's data (live
// identity counts, real emails, session counts) — the page executed and
// was serialized into the stream even though the layout never rendered it
// into the visible tree. Middleware runs before routing/rendering starts,
// so an unauthorized request never reaches any /console page component.
export const config = {
  matcher: "/console/:path*",
};

const KRATOS_PUBLIC_URL = process.env.KRATOS_PUBLIC_URL ?? "http://localhost:4433";
const KETO_READ_URL = process.env.KETO_READ_URL ?? "http://localhost:4466";
// Configurable rather than a hardcoded literal (authz-architecture.html
// pass: "avoid hardcoded platform checks where the new architecture makes
// them unnecessary, generalize where practical"). Still checks the
// EXISTING, real, populated Organization#admin relation, not the new Group
// model — migrating this specific gate to a Group `admin` permit needs the
// real `Organization:platform#admin` tuples migrated to a root Group's
// `owners` first (a real data migration, not a config change), so it's
// deferred rather than risking the one thing that must never regress: the
// admin console's own access gate. See the latest implementation report's
// "Authorization architecture compliance" section.
const PLATFORM_ORGANIZATION_ID = process.env.PLATFORM_ORGANIZATION_ID ?? "platform";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const cookie = request.headers.get("cookie") ?? "";

  // The actual requested console path — preserved as `return_to` so a
  // deep link (e.g. /console/clients/<id>) survives a re-auth round trip
  // instead of always dumping the admin back at the dashboard. Kratos's
  // login flow treats `return_to` as a literal browser-facing path, so it
  // must include the `/auth` basePath explicitly (Next's own redirect()
  // adds basePath automatically for internal navigation, but this value
  // is handed to an external service, not Next's router).
  const returnTo = `/auth${request.nextUrl.pathname}${request.nextUrl.search}`;

  const sessionResponse = await fetch(`${KRATOS_PUBLIC_URL}/sessions/whoami`, {
    cache: "no-store",
    headers: { cookie },
  });
  if (!sessionResponse.ok) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?return_to=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
  }

  const session = (await sessionResponse.json()) as { identity?: { id?: string } };
  const identityId = session.identity?.id;
  if (!identityId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?return_to=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
  }

  const checkResponse = await fetch(`${KETO_READ_URL}/relation-tuples/check`, {
    body: JSON.stringify({
      namespace: "Organization",
      object: PLATFORM_ORGANIZATION_ID,
      relation: "admin",
      subject_id: identityId,
    }),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  // Keto answers 403 for "denied"; both 200 and 403 carry `allowed`.
  const allowed =
    checkResponse.ok || checkResponse.status === 403
      ? ((await checkResponse.json()) as { allowed?: boolean }).allowed === true
      : false;

  if (!allowed) {
    // A friendly page instead of bare "403" text — see app/unauthorized/page.tsx.
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
