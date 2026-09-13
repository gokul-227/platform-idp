import type { AuditAction } from "@aec-craft/platform-id-contracts/audit/audit.vocabulary";
import { recordEvent } from "@aec-craft/platform-id-db/audit";
import { displayNameOf, emailOf } from "@aec-craft/platform-id-sdk/identity";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";

/**
 * The first `x-forwarded-for` entry is the original client. Null rather than a
 * loopback address when nothing was forwarded, which renders as "Not available"
 * instead of a misleading value.
 */
async function requestIp(): Promise<string | null> {
  const store = await headers();
  const forwardedFor = store.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }
  return store.get("x-real-ip");
}

async function requestUserAgent(): Promise<string | null> {
  const store = await headers();
  return store.get("user-agent");
}

/**
 * Record a console mutation, with the operator read from the session rather than
 * accepted as an argument, so a caller cannot record against somebody else.
 *
 * `actorIdentityId` is canonical, but a row keyed on it alone goes blank when the
 * identity is deleted and a lookup per row is an admin-API fan-out, so the email
 * and name are snapshotted here. Never throws: an audit failure must not fail the
 * operation it describes.
 */
export async function recordConsoleEvent(
  input: AuditAction & {
    resourceId?: string | null;
    /** What the subject was called at the time. */
    resourceLabel?: string | null;
    organization?: string | null;
    applicationId?: string | null;
    applicationName?: string | null;
    status?: "success" | "failure" | "denied";
    /** Why it did not succeed, how it was authenticated — facts about the
     *  call rather than about the change. */
    context?: Record<string, unknown>;
    /** What moved, as `before`/`after` where there is a diff to show. */
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const [session, ip, userAgent] = await Promise.all([
    getSession().catch(() => null),
    requestIp().catch(() => null),
    requestUserAgent().catch(() => null),
  ]);
  const identity = session?.identity;
  await recordEvent({
    ...input,
    actorType: "user",
    actorEmail: identity ? emailOf(identity) : null,
    actorIdentityId: identity?.id ?? null,
    actorName: identity ? displayNameOf(identity) : null,
    ip,
    // Minted here, once per call: every console mutation is its own request,
    // so there is nothing upstream to thread through.
    requestId: crypto.randomUUID(),
    sessionId: session?.id ?? null,
    userAgent,
  });
}
