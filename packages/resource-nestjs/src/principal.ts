/**
 * The caller as the token asserts them, and the whole contract other repositories
 * code against: an API gets these fields or a 401, and never calls the identity
 * service to learn more. Claim names are the issuer's, so there is no mapping
 * table to drift.
 */
export interface Principal {
  /**
   * `aal0`, `aal1` or `aal2`. Never absent and never a level that could not be
   * read: it ends at `aal0`, so a check demanding `aal2` refuses a caller
   * that never proved one.
   */
  readonly aal: string;
  /** Everything the issuer signed, for a caller that needs a claim not above. */
  readonly claims: Readonly<Record<string, unknown>>;
  /** The OAuth client holding the token. Null for a browser session. */
  readonly clientId: string | null;
  /** Absent when unknown, never empty, so absent reads as unknown. */
  readonly email: string | null;
  /** Staff role. Null for an ordinary user, which is almost every caller. */
  readonly staffRole: string | null;
  /**
   * A Kratos identity id for a person, a client id for a service. Nothing but
   * `type` tells the two namespaces apart, so read `type` before reading this.
   */
  readonly subject: string;
  /**
   * `user` for a person, `service` for a machine. A token is a person exactly when
   * its subject is not the client holding it, which is what separates an
   * authorization-code token from a client-credentials one.
   */
  readonly type: PrincipalType;
}

export type PrincipalType = "user" | "service";

const TYPES: readonly string[] = ["user", "service"];

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Claims to a principal, or null when the token describes none. Fails closed on
 * every axis: an unrecognised `type` is refused rather than guessed, a missing
 * `aal` becomes `aal0`, which satisfies no requirement.
 */
export function toPrincipal(claims: Record<string, unknown>): Principal | null {
  const subject = text(claims.sub);
  if (!subject) {
    return null;
  }
  const type = claim(claims, "type") ?? derivedType(claims, subject);
  if (!TYPES.includes(type)) {
    return null;
  }
  return {
    aal: claim(claims, "aal") ?? "aal0",
    claims: Object.freeze({ ...claims }),
    clientId: claim(claims, "clientId") ?? text(claims.client_id),
    email: claim(claims, "email"),
    // `ext` too, like every other claim here. Hydra nests what consent added, so
    // flat-only read null on every token this issuer mints: a resource server
    // gating on it refused admins along with everyone else, and `client-nextjs`
    // has always read the nested one. What bounds the reach is the audience pin,
    // which is registered per client, not the nesting.
    staffRole: claim(claims, "staffRole"),
    subject,
    type: type as PrincipalType,
  };
}

/**
 * A claim, wherever the issuer put it. Consent-time values are nested under
 * `ext`, so a top-level lookup silently takes every fail-closed default on a
 * token that stated them. The two shapes do not collide.
 */
function claim(claims: Record<string, unknown>, key: string): string | null {
  const flat = text(claims[key]);
  if (flat) {
    return flat;
  }
  const ext = claims.ext;
  return ext && typeof ext === "object"
    ? text((ext as Record<string, unknown>)[key])
    : null;
}

/**
 * Nothing this issuer mints states `type`, so every token takes this path: a
 * subject that is the client is a machine, anything else a person acting through
 * it. A stated `type` still wins, and an unrecognised one is refused: guessing
 * either way hands one kind of caller the other's reach.
 */
function derivedType(
  claims: Record<string, unknown>,
  subject: string
): PrincipalType {
  return text(claims.client_id) === subject ? "service" : "user";
}

/**
 * Assurance levels are ordinal and a requirement is a floor: a caller that
 * stepped higher still passes. An unrecognised spelling falls back to equality
 * rather than guessing an order, so a typo refuses rather than admits.
 */
const AAL_PATTERN = /^aal(\d+)$/;

export function meetsAal(actual: string, required: string): boolean {
  const left = AAL_PATTERN.exec(actual)?.[1];
  const right = AAL_PATTERN.exec(required)?.[1];
  if (!(left && right)) {
    return actual === required;
  }
  return Number(left) >= Number(right);
}
