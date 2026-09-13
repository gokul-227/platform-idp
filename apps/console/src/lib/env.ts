/**
 * Admin endpoints, plus the public Kratos the session is read against. The admin
 * APIs authenticate nobody, so whatever reaches them holds full control: they
 * stay off any public network and only this app has a route to them.
 */
export const env = {
  kratosAdminUrl: process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434",
  hydraAdminUrl: process.env.HYDRA_ADMIN_URL ?? "http://localhost:4445",
  kratosPublicUrl: process.env.KRATOS_PUBLIC_URL ?? "http://localhost:4433",
  /** Hydra's public issuer: the `iss` this console's own client validates
   *  against, and the token endpoint it posts to. */
  hydraPublicUrl: process.env.HYDRA_PUBLIC_URL ?? "http://localhost:4444",
  /** This console's own OAuth2 client on this estate's Hydra, which is how it
   *  reaches `/admin/*` as the signed-in operator rather than as a second
   *  trust root. Unset, the organization pages degrade to an empty list. */
  oidcClientId: process.env.OIDC_CLIENT_ID ?? "",
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
  /** Link back to the sign-in app from the sidebar footer. */
  idAppUrl: process.env.ID_APP_URL ?? "http://localhost:3200",
  /** This app's public origin; also what the sign-in app returns to. */
  consoleUrl: process.env.CONSOLE_URL ?? "http://localhost:3201",
  /**
   * The resource server holding a profile row per identity, told when one is
   * deleted, because Kratos fires no hook for an admin deletion. Empty means no
   * such consumer and the call is skipped; set but unreachable is an outage, and
   * refuses the deletion.
   */
  platformApiUrl: process.env.PLATFORM_API_URL ?? "",
  /** Shared secret for the above. Both ends mount the same value. */
};
