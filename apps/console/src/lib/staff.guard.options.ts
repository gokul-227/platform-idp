import { STAFF_SCHEMA } from "@aec-craft/platform-id-contracts/identity/identity.schema";
import { STAFF_ROLES } from "@aec-craft/platform-id-contracts/identity/staff.roles";

/**
 * Everything the guard accepts as configuration, all optional and each also read
 * from an environment variable. The three URLs take a path or an absolute URL; a
 * path resolves against the surface it belongs to, which is what lets the
 * cross-origin default and a single-origin deployment share one option.
 */
export interface StaffGuardOptions {
  /** This app's public origin. Env: `CONSOLE_URL`. */
  appUrl?: string;
  /**
   * Shared secret for the audit route above. Env: `AUDIT_WEBHOOK_SECRET`.
   * Unset means denial capture is off, not open: the guard never sends a
   * request an unconfigured route would refuse anyway.
   */
  auditHookSecret?: string;
  /**
   * Where a denial is recorded, an internal route in this app because the guard
   * runs at the edge and cannot reach Postgres. Default `/api/internal/audit`.
   */
  auditHookUrl?: string;
  /** Response header naming the failed condition. Never rendered to a caller. */
  deniedHeader?: string;
  /** The dead end that states why. Default `/denied` on `appUrl`. */
  deniedUrl?: string;
  /** Kratos's public base URL. Env: `KRATOS_PUBLIC_URL`. */
  kratosPublicUrl?: string;
  /**
   * Lowest assurance level the app accepts, compared as a minimum: a session
   * that stepped higher still passes. Default `aal2`.
   */
  requiredAal?: string;
  /**
   * Accepted `metadata_public.staffRole` values; an unlisted one admits nobody.
   * `null` drops the requirement, which is what a customer-facing app wants:
   * its users carry no role, so any check would refuse all of them.
   */
  roles?: readonly string[] | null;
  /**
   * Identity schema the app admits. `null` accepts any, for a surface that is
   * not restricted to one pool. Default `staff`.
   */
  schema?: string | null;
  /** Sign-in surface. Default `/login` on the sign-in app (env: `ID_APP_URL`). */
  signInUrl?: string;
  /** Kratos's own step-up flow. Default `/self-service/login/browser` on Kratos. */
  stepUpUrl?: string;
}

export interface ResolvedGuardOptions {
  readonly appUrl: string;
  /** Null when denial capture is off — the guard checks this, not an empty
   *  string, so an operator who never set the secret gets silence rather
   *  than a request to a route that would 404 anyway. */
  readonly auditHookSecret: string | null;
  readonly auditHookUrl: string;
  readonly deniedHeader: string;
  readonly deniedUrl: string;
  readonly kratosPublicUrl: string;
  readonly requiredAal: string;
  readonly roles: readonly string[] | null;
  readonly schema: string | null;
  readonly signInUrl: string;
  /** Kratos's error id for a session that may still step up to `requiredAal`. */
  readonly stepUpErrorId: string;
  readonly stepUpUrl: string;
}

const DEFAULT_KRATOS_PUBLIC_URL = "http://localhost:4433";
const DEFAULT_ID_APP_URL = "http://localhost:3200";
const TRAILING_SLASHES = /\/+$/;

/**
 * Resolved per request, never at module scope, which Next can inline at build time.
 * Every read has a fallback, or an unset variable puts "undefined" in a URL.
 *
 * `appUrl` is the exception: the only candidate left is the request's own origin,
 * and it is the base for a refused operator's redirect, so trusting it hands
 * whoever asks that destination. Throwing names the mistake instead.
 */
export function resolveGuardOptions(
  options: StaffGuardOptions
): ResolvedGuardOptions {
  // `||`, not `??`: a variable set to the empty string is a missing one here,
  // and an empty base makes every URL below throw.
  const appUrl =
    options.appUrl || process.env.APP_URL || process.env.CONSOLE_URL;
  if (!appUrl) {
    throw new Error(
      "console: APP_URL or CONSOLE_URL must be set. It is the base for the /denied redirect, so it cannot be taken from the request."
    );
  }
  const kratosPublicUrl = (
    options.kratosPublicUrl ||
    process.env.KRATOS_PUBLIC_URL ||
    DEFAULT_KRATOS_PUBLIC_URL
  ).replace(TRAILING_SLASHES, "");
  const idAppUrl = process.env.ID_APP_URL || DEFAULT_ID_APP_URL;
  const requiredAal = options.requiredAal ?? "aal2";

  return {
    appUrl,
    auditHookSecret:
      options.auditHookSecret || process.env.AUDIT_WEBHOOK_SECRET || null,
    auditHookUrl: new URL(
      options.auditHookUrl ?? "/api/internal/audit",
      appUrl
    ).toString(),
    deniedHeader: options.deniedHeader ?? "X-Access-Denied",
    deniedUrl: new URL(options.deniedUrl ?? "/denied", appUrl).toString(),
    kratosPublicUrl,
    requiredAal,
    // `?? ` rather than `||`: null is a deliberate "no requirement", where
    // undefined means "use this platform's default".
    roles: options.roles === undefined ? STAFF_ROLES : options.roles,
    schema: options.schema === undefined ? STAFF_SCHEMA : options.schema,
    signInUrl: new URL(options.signInUrl ?? "/login", idAppUrl).toString(),
    // Kratos names these `session_aal1_required` / `session_aal2_required`.
    stepUpErrorId: `session_${requiredAal}_required`,
    stepUpUrl: new URL(
      options.stepUpUrl ?? "/self-service/login/browser",
      kratosPublicUrl
    ).toString(),
  };
}
