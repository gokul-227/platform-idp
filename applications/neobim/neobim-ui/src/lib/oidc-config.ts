/**
 * NeoBIM UI is an OIDC relying party against THIS platform's existing Ory
 * Hydra + Kratos — the exact same integration shape already proven live for
 * Mealie, Open WebUI, Superset, and Airflow (see docs/07-applications/).
 *
 * This intentionally does NOT use platform-neobim's own
 * `@aec-craft/platform-auth-nextjs` SDK: that package's `auth.handlers.*`
 * assume NeoBIM's own Better Auth / oauth-provider issuer topology
 * (`@aec-craft/platform-config`) and NeoBIM's own token shape. Per the
 * explicit scope for this integration — reuse the UI, not the identity
 * backend — this is fresh, minimal OIDC-client code instead, following the
 * same pattern as this platform's other reference client,
 * `applications/examples/authlib-demo`.
 */

import * as client from "openid-client";

export function oidcEnv() {
  const issuer = process.env.HYDRA_PUBLIC_URL ?? "http://localhost:4455";
  const clientId = process.env.NEOBIM_OIDC_CLIENT_ID ?? "neobim-ui";
  const clientSecret = process.env.NEOBIM_OIDC_CLIENT_SECRET;
  const redirectUri =
    process.env.NEOBIM_REDIRECT_URI ??
    "http://localhost:9930/auth/callback";
  const postLogoutRedirectUri =
    process.env.NEOBIM_POST_LOGOUT_REDIRECT_URI ??
    "http://localhost:9930/";

  if (!clientSecret) {
    throw new Error(
      "NEOBIM_OIDC_CLIENT_SECRET is not set — see docs/07-applications/neobim/neobim-ui.md"
    );
  }

  return { issuer, clientId, clientSecret, redirectUri, postLogoutRedirectUri };
}

/**
 * This app's own public origin (e.g. http://localhost:9930), derived from
 * NEOBIM_REDIRECT_URI. `request.url` in a route handler reflects this
 * container's internal hostname:port, not the publicly reachable one
 * (confirmed live via debug logging) — every redirect back to a page on
 * this app (not to Hydra/Kratos) must use this instead of `request.url`.
 */
export function publicOrigin(env: ReturnType<typeof oidcEnv>): string {
  return new URL(env.redirectUri).origin;
}

/**
 * openid-client v6 refuses plain-HTTP discovery/token requests by default
 * (a real security safeguard) — confirmed live: `OAUTH_HTTP_REQUEST_FORBIDDEN
 * ... only requests to HTTPS are allowed` against this local Compose stack,
 * which terminates no TLS anywhere. `NEOBIM_OIDC_ALLOW_INSECURE_HTTP=true`
 * opts back in for local/plain-HTTP deployments only — a real TLS-terminated
 * deployment must NOT set this, same convention as this platform's other
 * OIDC client apps (e.g. openid-client-demo's OIDC_ALLOW_INSECURE_HTTP).
 */
export async function discoverHydra(
  env: ReturnType<typeof oidcEnv>
): Promise<client.Configuration> {
  const allowInsecure = process.env.NEOBIM_OIDC_ALLOW_INSECURE_HTTP === "true";
  return client.discovery(
    new URL(env.issuer),
    env.clientId,
    env.clientSecret,
    // openid-client v6 defaults to client_secret_post when clientAuthentication
    // is omitted — confirmed live: Hydra rejected the token request with
    // invalid_client ("supports ... client_secret_basic, but ... client_secret_post
    // was requested"). This client is registered with client_secret_basic
    // (integrations/applications/neobim-ui.yaml), so it must be requested explicitly.
    client.ClientSecretBasic(env.clientSecret),
    allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined
  );
}
