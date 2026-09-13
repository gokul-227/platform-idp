import { timingSafeEqual } from "node:crypto";
import { Configuration, IdentityApi } from "@ory/client-fetch";
import { type NextRequest, NextResponse } from "next/server";
import { sessionForIdentity } from "@/lib/consent.claims";
import { env } from "@/lib/env";
import { gcpAuthMiddleware } from "@/lib/gcp-identity-token";

/**
 * Hydra's `oauth2.refresh_token_hook`, called server to server on every refresh
 * grant. Without it a refresh replays the claims consent stored, so a demoted
 * admin, or an address removed from `ROOT_EMAILS`, keeps travelling until the
 * refresh chain ends. With it the estate is asked again, and the answer a
 * resource server acts on is at most one access-token lifetime old.
 *
 * Refusing is a 403, which Hydra turns into a failed refresh: the person signs in
 * again rather than carrying a claim nobody would grant now. A deactivated or
 * deleted identity stops here for the same reason.
 *
 * The client is private to this module and the only identity it reads is the one
 * Hydra named, for the reason `account.deletion.ts` keeps its own: a general
 * `identityAdmin` export from this app is the whole capability.
 */
const identityAdmin = new IdentityApi(
  new Configuration({
    basePath: env.kratosAdminUrl,
    middleware: [gcpAuthMiddleware(env.kratosAdminUrl)],
  })
);

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

/** What Hydra sends: the subject, and the session it stored at consent. */
/** Hydra's refresh hook request: the claims the last token carried sit under
 *  `session.extra` (access token) and `session.id_token.id_token_claims.ext`. */
interface HookPayload {
  session?: {
    extra?: Record<string, unknown>;
    id_token?: { id_token_claims?: { ext?: Record<string, unknown> } };
  };
  subject?: unknown;
}

/** `aal` describes how the session authenticated, which a refresh cannot change. */
function storedAal(payload: HookPayload): string | null {
  const stored =
    payload.session?.extra?.aal ??
    payload.session?.id_token?.id_token_claims?.ext?.aal;
  return typeof stored === "string" && stored ? stored : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.REFRESH_HOOK_SECRET;
  if (!expected) {
    // Off rather than open: an unconfigured hook must not let every refresh
    // through carrying claims nobody re-checked.
    return NextResponse.json({ error: "not configured" }, { status: 404 });
  }
  // A named header rather than `Authorization`, matching the audit receiver: the
  // value is a shared secret, not a bearer token any issuer minted.
  if (!secretMatches(request.headers.get("x-refresh-hook-token"), expected)) {
    return NextResponse.json({ error: "refused" }, { status: 401 });
  }

  let payload: HookPayload;
  try {
    payload = (await request.json()) as HookPayload;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const subject = typeof payload.subject === "string" ? payload.subject : "";
  if (!subject) {
    return NextResponse.json({ error: "no subject" }, { status: 400 });
  }

  const identity = await identityAdmin
    .getIdentity({ id: subject })
    .catch(() => null);
  // Gone, or no longer allowed to sign in: refuse rather than reissue.
  if (!(identity && identity.state === "active")) {
    return NextResponse.json({ error: "refused" }, { status: 403 });
  }

  return NextResponse.json({
    session: sessionForIdentity(identity, storedAal(payload)),
  });
}
