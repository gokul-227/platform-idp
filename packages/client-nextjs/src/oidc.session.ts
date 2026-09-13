import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { refreshTokenGrant, type TokenEndpointResponse } from "openid-client";
import { COOKIE, cookieName } from "./oidc.cookies";
import { getConfiguration, readExpiry } from "./oidc.discovery";
import type { ResolvedIdClientOptions } from "./oidc.options";

/** What a page gets. Deliberately the token plus its claims, and nothing else. */
export interface IdSession {
  /** Assurance level the granting session reached, or null if not stated. */
  readonly aal: string | null;
  readonly accessToken: string;
  /** The access token's claims, as the issuer wrote them, `ext` included. */
  readonly claims: Record<string, unknown>;
  readonly email: string | null;
  /** Seconds since the epoch, or null for an opaque token. */
  readonly expiresAt: number | null;
  /** Identity schema of the subject, or null if not stated. */
  readonly schema: string | null;
  /**
   * Staff role, null on every delegated token: consent puts none into a grant,
   * so operator access cannot be exercised through an OAuth client. Present
   * because the claim contract has it and a scope could fill it later.
   */
  readonly staffRole: string | null;
  readonly subject: string | null;
}

const CLAIM_SEGMENTS = 3;

function decodeClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== CLAIM_SEGMENTS) {
    return {};
  }
  try {
    const payload = parts[1] ?? "";
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(
      Buffer.from(
        padded.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      ).toString()
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Hydra nests what a consent decision added under a single `ext` claim, so a
 * reader looking for `email` beside `sub` finds nothing. Top level is checked
 * first, since another issuer or a mapper may promote them.
 */
function claim(claims: Record<string, unknown>, name: string): string | null {
  const top = asString(claims[name]);
  if (top) {
    return top;
  }
  const ext = claims.ext;
  if (ext && typeof ext === "object") {
    return asString((ext as Record<string, unknown>)[name]);
  }
  return null;
}

/**
 * The session as the request carries it. Read-only: a Server Component cannot
 * write a cookie, so renewal belongs to the gate, which owns a response.
 *
 * Claims are read, not verified: this is the app reading a token it fetched over
 * TLS itself. Anything trusting a token it did not fetch must verify it.
 */
export async function readSession(
  options: ResolvedIdClientOptions
): Promise<IdSession | null> {
  const jar = await cookies();
  return sessionFromToken(jar.get(cookieName(options, COOKIE.ACCESS))?.value);
}

/** The same session read off a request, for a proxy, where `cookies()` is not available. */
export function sessionFromRequest(
  options: ResolvedIdClientOptions,
  request: NextRequest
): IdSession | null {
  return sessionFromToken(
    request.cookies.get(cookieName(options, COOKIE.ACCESS))?.value
  );
}

function sessionFromToken(accessToken: string | undefined): IdSession | null {
  if (!accessToken) {
    return null;
  }
  const claims = decodeClaims(accessToken);
  return {
    aal: claim(claims, "aal"),
    accessToken,
    claims,
    email: claim(claims, "email"),
    expiresAt: readExpiry(accessToken),
    schema: claim(claims, "schema"),
    staffRole: claim(claims, "staffRole"),
    subject: asString(claims.sub),
  };
}

/**
 * Trade a refresh token for a new set. Returns null on any failure, which is
 * the same outcome as having no session: the visitor signs in again.
 */
export async function refresh(
  options: ResolvedIdClientOptions,
  refreshToken: string
): Promise<TokenEndpointResponse | null> {
  try {
    const config = await getConfiguration(options);
    // The audience travels with the refresh too, or a renewed token silently
    // loses the one the first token had and the next relayed call 401s.
    return await refreshTokenGrant(config, refreshToken, {
      audience: options.apiUrl,
    });
  } catch (error) {
    // Expired, revoked or reused: not recoverable by retrying, but worth a line,
    // because "renewal failed" and "nothing to renew" produce the same 401 and
    // want different fixes.
    console.warn(
      "[@aec-craft/platform-id-client-nextjs] refresh failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * One exchange per refresh token, its answer kept for a minute after it settles.
 * Hydra reads a second use of a rotated token as a breach and revokes the chain,
 * and in-flight deduplication alone does not cover the request that arrives just
 * after an exchange settled. A failure is not kept, so a transient one retries.
 *
 * Per process, and a Next app has more than one, so only the issuer's rotation
 * grace period covers the gate and the relay racing.
 */
const exchanges = new Map<string, Promise<TokenEndpointResponse | null>>();

/** Long enough to cover requests already in flight when the token rotated. */
const RETAIN_RESULT_MS = 60_000;

export function refreshOnce(
  options: ResolvedIdClientOptions,
  refreshToken: string
): Promise<TokenEndpointResponse | null> {
  const running = exchanges.get(refreshToken);
  if (running) {
    return running;
  }
  const started = refresh(options, refreshToken);
  exchanges.set(refreshToken, started);
  started.then(
    (tokens) => {
      if (tokens) {
        forget(refreshToken, RETAIN_RESULT_MS);
      } else {
        exchanges.delete(refreshToken);
      }
    },
    () => exchanges.delete(refreshToken)
  );
  return started;
}

function forget(refreshToken: string, delay: number): void {
  const timer = setTimeout(() => exchanges.delete(refreshToken), delay) as
    | ReturnType<typeof setTimeout>
    | { unref?: () => void };
  // Node only; the timer must not hold a process open on its own.
  (timer as { unref?: () => void }).unref?.();
}

/**
 * Headroom before an access token counts as spent: one that expires mid-flight
 * fails like one that expired a minute ago, and the cookie carrying it is
 * floored at a minute, so the two do not expire together.
 */
const EXPIRY_SKEW_SECONDS = 30;

/** Is this session's access token still worth sending? */
export function isSpent(expiresAt: number | null): boolean {
  return (
    expiresAt === null || expiresAt - EXPIRY_SKEW_SECONDS <= Date.now() / 1000
  );
}
