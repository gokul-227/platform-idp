import { parseAuditIntake } from "@aec-craft/platform-id-contracts/audit/audit.intake";
import { recordEvent } from "@aec-craft/platform-id-db/audit";
import { type NextRequest, NextResponse } from "next/server";
import { secretMatches } from "@/lib/audit.intake";

/**
 * Internal audit receiver for the staff session guard, which runs at the edge and
 * cannot open a Postgres connection.
 *
 * Refuses unless the shared secret matches, since a forged row is indistinguishable
 * from a real one, and is off entirely when `AUDIT_WEBHOOK_SECRET` is unset. The
 * body is validated against the vocabulary too: the secret proves the caller, not
 * the shape, and what it carries reaches an insert.
 */
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
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await recordEvent(parsed.value);
  return NextResponse.json({});
}
