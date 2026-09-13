/**
 * Everything this app needs, and nothing privileged: no admin URL, no client
 * secret, no API key. A guarded consumer talks to Kratos's public API only, and
 * only to ask about the session it already holds a cookie for.
 */
export const env = {
  /** This app's own origin. The guard builds its redirects against it. */
  appUrl: process.env.APP_URL ?? "http://localhost:3202",
  /** Where sign-in happens. Not this app; it renders no flow of its own. */
  idAppUrl: process.env.ID_APP_URL ?? "http://localhost:3200",
  kratosPublicUrl: process.env.KRATOS_PUBLIC_URL ?? "http://localhost:4433",
};
