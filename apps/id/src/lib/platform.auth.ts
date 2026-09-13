import "server-only";

import { createIdClient } from "@aec-craft/platform-id-client-nextjs";
import { env } from "./env";

/**
 * This app as an OAuth2 client of its own issuer, so a page can call platform's
 * API as the signed-in person. Two sessions coexist: Kratos says who is signed
 * in, this one holds a token platform accepts for them.
 *
 * Must be registered `client_secret_post`. `openid-client` sends the secret in
 * the body, so a `client_secret_basic` registration fails the exchange with
 * `invalid_client` while the authorization succeeds — which surfaces as a
 * redirect loop, not an error. `scripts/seed-platform-client.ts` gets it right.
 */
export const platformAuth = createIdClient({
  apiUrl: env.platformApiUrl,
  appUrl: env.appUrl,
  clientId: env.oidcClientId,
  // Distinct from the package default so this app's platform token cannot
  // collide with a cookie written by another buildOS client sharing the origin.
  cookiePrefix: "buildos_platform_",
  getClientSecret: () => env.oidcClientSecret,
  issuer: env.hydraPublicUrl,
  postLoginRedirect: "/tenancy",
  // Left unset, the package defaults to `loginUrl`, which `scripts/seed-platform-client.ts`
  // never registers as a `post_logout_redirect_uri` — Hydra then rejects the hand-off with
  // its own fallback error page. This route drops only the platform token, not the Kratos
  // session (see `auth/[action]/route.ts`), so landing back on `/tenancy` is also the
  // right UX, matching `postLoginRedirect` above.
  postLogoutRedirect: "/tenancy",
  // `offline_access` is what yields the refresh token the callback stores;
  // without it every page load past the access token's ten minutes would send
  // the visitor back through the authorization round trip.
  scopes: ["openid", "email", "offline_access"],
});

/**
 * Whether this app is configured to obtain a platform token at all.
 *
 * A deployment with no registered client is a real one — the account and flow
 * surfaces need none of this — so the organization pages check rather than
 * assume, and say so plainly instead of bouncing somebody through an
 * authorization that cannot succeed.
 */
export function isPlatformAuthConfigured(): boolean {
  return Boolean(
    env.platformApiUrl && env.oidcClientId && env.oidcClientSecret
  );
}
