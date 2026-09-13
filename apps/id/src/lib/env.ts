/**
 * Local-dev defaults match the root compose.yaml. `kratosBrowserUrl` is what the
 * browser can reach, and diverges from `kratosPublicUrl` inside a container
 * network.
 *
 * Two admin URLs, both exceptions: Hydra admin because the consent contract
 * requires accepting the challenge, Kratos admin for the one call closing your
 * own account (`account.deletion.ts` keeps it narrow).
 */
export const env = {
  kratosPublicUrl: process.env.KRATOS_PUBLIC_URL ?? "http://localhost:4433",
  kratosBrowserUrl:
    process.env.NEXT_PUBLIC_KRATOS_BROWSER_URL ??
    process.env.KRATOS_PUBLIC_URL ??
    "http://localhost:4433",
  hydraAdminUrl: process.env.HYDRA_ADMIN_URL ?? "http://localhost:4445",
  kratosAdminUrl: process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434",
  /**
   * The resource server holding a profile row per identity, told before the
   * identity goes. Empty means no such consumer and the call is skipped, which
   * is a real deployment; a URL that is set but unreachable refuses the
   * deletion rather than orphaning the row.
   */
  platformApiUrl: process.env.PLATFORM_API_URL ?? "",
  /** This app's own public origin, and its OAuth2 client on this estate's
   *  Hydra — how it reaches the platform API as the signed-in person rather
   *  than as itself. Unset, the organization surfaces show the way in instead
   *  of a list. */
  appUrl: process.env.APP_URL ?? "http://localhost:3200",
  hydraPublicUrl: process.env.HYDRA_PUBLIC_URL ?? "http://localhost:4444",
  oidcClientId: process.env.OIDC_CLIENT_ID ?? "",
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
  /** Shared secret for the above. Both ends mount the same value. */
  identityWebhookSecret: process.env.IDENTITY_WEBHOOK_SECRET ?? "",
  /**
   * Origins a `return_to` may point at, for links this app renders itself.
   * Empty means paths only; see `safe-return-to.ts` for why absolute values
   * cannot be trusted as they arrive.
   */
  allowedReturnOrigins: (process.env.ALLOWED_RETURN_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
