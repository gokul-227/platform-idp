import "server-only";

import { createIdClient } from "@aec-craft/platform-id-client-nextjs";
import { env } from "./env";

/**
 * This console as an OAuth2 client of its own issuer, so `/admin/*` is reached
 * as the signed-in staff member rather than as a service.
 *
 * Platform's `StaffGuard` admits a token whose identity is on the `staff`
 * schema and whose session already reached aal2 — both facts an ordinary
 * authorization-code token already carries, since consent emits `schema` and
 * the console's own login requires the second factor before it ever redirects
 * here. Nothing is minted here and no second trust root exists — the console
 * holds a client registration, the same as any other application on this
 * issuer.
 *
 * `client_secret_post`, because `openid-client` sends the secret in the body;
 * a `client_secret_basic` registration fails the exchange with `invalid_client`
 * while the authorization succeeds, which surfaces as a redirect loop rather
 * than an error. `scripts/seed-platform-client.ts` gets it right.
 *
 * The round trip is silent: Hydra sends the browser to this estate's own login
 * UI, which answers the challenge from the Kratos session the operator already
 * holds (`apps/id/src/lib/login.challenge.ts`), so no screen is shown.
 */
export const platformAuth = createIdClient({
  apiUrl: env.platformApiUrl,
  appUrl: env.consoleUrl,
  clientId: env.oidcClientId,
  // Distinct from apps/id's, so an operator signed into both on one origin
  // does not have one app's token overwritten by the other's.
  cookiePrefix: "buildos_console_platform_",
  getClientSecret: () => env.oidcClientSecret,
  issuer: env.hydraPublicUrl,
  postLoginRedirect: "/tenancy",
  postLogoutRedirect: "/tenancy",
  // The platform's staff gate wants aal2 in the token itself; a token minted
  // before the second factor would be refused there until it was re-minted.
  requiredAal: "aal2",
  scopes: ["openid", "email", "offline_access"],
});

/** Whether this console is registered to reach platform at all. A deployment
 *  without the pair is a real one: every page falls back to what its own
 *  service credential can see. */
export function isPlatformAuthConfigured(): boolean {
  return Boolean(
    env.platformApiUrl && env.oidcClientId && env.oidcClientSecret
  );
}
