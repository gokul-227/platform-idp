import type { NextResponse } from "next/server";
import type { ResolvedIdClientOptions } from "./oidc.options";

/** Cookie suffixes, prefixed with `cookiePrefix`. */
export const COOKIE = {
  /** The bearer. Lifetime follows the token's own expiry. */
  ACCESS: "at",
  /** Refresh material. Outlives the access token, which is the point. */
  REFRESH: "rt",
  /**
   * The id token, kept for one reason: RP-initiated logout. Hydra refuses a
   * `post_logout_redirect_uri` unless the request also carries `id_token_hint`,
   * so without this stored, signing out cannot come back to the app.
   */
  ID: "it",
  /** Transient, one login round trip: the PKCE verifier. */
  PKCE: "pkce",
  /** Transient: anti-CSRF state, minted at login and checked at callback. */
  STATE: "state",
  /** Transient: where the visitor was heading before being sent to login. */
  RETURN_TO: "rto",
} as const;

/**
 * Adds the `__Host-` prefix when the browser's conditions for it are met
 * (Secure, Path=/, no Domain). That prefix is a browser-enforced guarantee that
 * no sibling subdomain can write the cookie, which matters on a shared parent
 * domain: without it, any host under it can plant a session cookie.
 */
export function cookieName(
  options: ResolvedIdClientOptions,
  suffix: string
): string {
  const base = `${options.cookiePrefix}${suffix}`;
  return options.secureCookies ? `__Host-${base}` : base;
}

interface CookieAttributes {
  readonly httpOnly: boolean;
  readonly maxAge: number;
  readonly path: string;
  readonly sameSite: "lax";
  readonly secure: boolean;
}

/**
 * `sameSite: "lax"` rather than `strict`: the callback arrives as a top-level
 * navigation from the issuer, and `strict` would withhold the transient cookies
 * on exactly that request, breaking every login.
 */
export function sessionCookie(
  options: ResolvedIdClientOptions,
  maxAge: number
): CookieAttributes {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: options.secureCookies,
  };
}

/** Ten minutes is a login round trip with room for a slow consent screen. */
export function transientCookie(
  options: ResolvedIdClientOptions
): CookieAttributes {
  return sessionCookie(options, 600);
}

/** Clears every cookie this package writes, including the transients. */
export function clearCookies(
  response: NextResponse,
  options: ResolvedIdClientOptions
): void {
  for (const suffix of Object.values(COOKIE)) {
    response.cookies.set(cookieName(options, suffix), "", {
      ...sessionCookie(options, 0),
    });
  }
}
