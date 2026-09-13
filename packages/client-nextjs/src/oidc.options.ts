/**
 * What an app needs to be an OAuth client of buildOS ID. Four values are required
 * because only the app knows them: the issuer it trusts, who it claims to be, the
 * secret proving it, and its own origin. Everything else defaults, and every value
 * also reads an env var, so one build moves between environments.
 */
export interface IdClientOptions {
  /**
   * Where `handlers.forward` relays, and the `audience` on every token request.
   * Unrequested, or missing from the client's registered `audience`, the token
   * arrives with an empty `aud` and a correct relay returns 401 for a reason
   * nothing here can see. One option feeds both. Env: `PLATFORM_API_URL`.
   */
  apiUrl?: string;
  /**
   * This app's public origin. Every redirect is built on it, so it cannot fall
   * back to the request's own host: behind Cloud Run that is the container's
   * bind address. Env: `APP_URL`.
   */
  appUrl?: string;
  /** Must match a `redirect_uris` entry on the client. Default `/auth/callback`. */
  callbackPath?: string;
  /** Env: `OIDC_CLIENT_ID`. Issued by the console when the app is registered. */
  clientId?: string;
  /**
   * Cookie name prefix, so two apps on one origin do not collide. Default
   * `buildos_`.
   */
  cookiePrefix?: string;
  /**
   * Where the callback sends somebody who declined. Default `/auth/denied`, and
   * it must sit outside whatever the guard protects, or the redirect starts a new
   * authorization and loops them back into the screen they just refused.
   */
  deniedPath?: string;
  /**
   * Read late, never at module scope: a factory call runs at import time, and a
   * build machine has no business holding this. Env: `OIDC_CLIENT_SECRET`.
   */
  getClientSecret?: () => string;
  /** Hydra's public base URL, the `iss` in every token. Env: `OIDC_ISSUER`. */
  issuer?: string;
  /** Where the login route lives, for the gate to redirect to. Default `/auth/login`. */
  loginPath?: string;
  /** Where to land after a login that carried no `return_to`. Default `/`. */
  postLoginRedirect?: string;
  /** Where to land after signing out. Default the login path. */
  postLogoutRedirect?: string;
  /**
   * The assurance level a token must state for the gate to serve it. A token
   * minted while the session was at aal1 says so and keeps saying so through
   * every refresh, so an app whose resource server wants aal2 re-authorizes
   * instead of forwarding a token that will be refused.
   */
  requiredAal?: string;
  /** Requested scopes. `offline_access` is what yields a refresh token. */
  scopes?: readonly string[];
  /**
   * Whether cookies carry `Secure` and the `__Host-` prefix. True unless `appUrl`
   * is plain http: a Secure cookie is dropped silently over http, and the failure
   * looks like a login that succeeds and then forgets you.
   */
  secureCookies?: boolean;
}

export interface ResolvedIdClientOptions {
  readonly apiUrl: string;
  readonly appUrl: string;
  readonly callbackUrl: string;
  readonly clientId: string;
  readonly cookiePrefix: string;
  readonly deniedUrl: string;
  readonly getClientSecret: () => string;
  readonly issuer: string;
  readonly loginUrl: string;
  readonly postLoginRedirect: string;
  readonly postLogoutRedirect: string;
  readonly requiredAal: string | null;
  readonly scopes: readonly string[];
  readonly secureCookies: boolean;
}

const LOG_PREFIX = "[@aec-craft/platform-id-client-nextjs]";
const TRAILING_SLASHES = /\/+$/;
const DEFAULT_ISSUER = "http://localhost:4444";
const DEFAULT_APP_URL = "http://localhost:3202";
const DEFAULT_API_URL = "http://localhost:3100";
const DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"];

/**
 * An origin, or the fallback. Anything unparseable counts as absent, including the
 * literal "undefined" a shell produces from an unset variable: left to `new URL`
 * it throws, and every request 500s with "Invalid URL" and no variable named.
 */
function origin(value: string | undefined, fallback: string): string {
  const candidate = (value || fallback).replace(TRAILING_SLASHES, "");
  try {
    return new URL(candidate).origin === "null"
      ? fallback
      : new URL(candidate).toString().replace(TRAILING_SLASHES, "");
  } catch {
    console.warn(
      `${LOG_PREFIX} "${candidate}" is not a usable URL; falling back to ${fallback}`
    );
    return fallback;
  }
}

/**
 * Resolved per request, never at module scope, which Next can inline at build time
 * and bake a build machine's value in. `||` rather than `??`: an empty string is a
 * missing variable here, and an empty base makes every URL below throw.
 */
export function resolveIdClientOptions(
  options: IdClientOptions
): ResolvedIdClientOptions {
  const appUrl = origin(options.appUrl || process.env.APP_URL, DEFAULT_APP_URL);
  const apiUrl = origin(
    options.apiUrl || process.env.PLATFORM_API_URL,
    DEFAULT_API_URL
  );
  const issuer = origin(
    options.issuer || process.env.OIDC_ISSUER,
    DEFAULT_ISSUER
  );
  const loginUrl = new URL(
    options.loginPath ?? "/auth/login",
    appUrl
  ).toString();

  return {
    apiUrl,
    appUrl,
    deniedUrl: new URL(options.deniedPath ?? "/auth/denied", appUrl).toString(),
    callbackUrl: new URL(
      options.callbackPath ?? "/auth/callback",
      appUrl
    ).toString(),
    clientId: options.clientId || process.env.OIDC_CLIENT_ID || "",
    cookiePrefix: options.cookiePrefix ?? "buildos_",
    getClientSecret:
      options.getClientSecret ?? (() => process.env.OIDC_CLIENT_SECRET ?? ""),
    issuer,
    loginUrl,
    postLoginRedirect: options.postLoginRedirect ?? "/",
    postLogoutRedirect: options.postLogoutRedirect ?? loginUrl,
    requiredAal: options.requiredAal ?? null,
    scopes: options.scopes ?? DEFAULT_SCOPES,
    // Inferred from the origin, not defaulted to true: a Secure cookie over
    // http is dropped by the browser without an error anywhere, and the symptom
    // is a login that appears to work and then forgets you on the next request.
    secureCookies: options.secureCookies ?? appUrl.startsWith("https://"),
  };
}
