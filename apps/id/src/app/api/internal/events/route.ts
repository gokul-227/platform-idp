import { timingSafeEqual } from "node:crypto";
import { parseAuditIntake } from "@aec-craft/platform-id-contracts/audit/audit.intake";
import { recordEvent } from "@aec-craft/platform-id-db/audit";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Internal audit receiver for Kratos flow hooks. Kratos owns authentication and
 * runs as a separate process, so an outbound `web_hook` is the only way these
 * events exist; the path deliberately does not advertise which caller it serves.
 *
 * Wired in `kratos.local.yml`, since the URL and secret are environment-specific,
 * with the body rendered by `audit.jsonnet`. Unset `AUDIT_WEBHOOK_SECRET` turns
 * the route off rather than open.
 */
function secretMatches(presented: string | null, expected: string): boolean {
  if (!presented) {
    return false;
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.AUDIT_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "not configured" }, { status: 404 });
  }
  if (!secretMatches(request.headers.get("x-audit-token"), expected)) {
    return NextResponse.json({ error: "refused" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const parsed = parseAuditIntake(body);
  if (!parsed.ok) {
    // Logged rather than only answered: Kratos ignores this response, so a
    // hook rendering the wrong shape would otherwise fail silently forever.
    console.error("[audit] rejected hook body", parsed.error);
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await recordEvent(parsed.value);

  // 200 with an empty object: Kratos treats a non-2xx from an `after` hook as
  // a flow failure, so a broken audit path must not stop anyone signing in.
  return NextResponse.json({});
}
