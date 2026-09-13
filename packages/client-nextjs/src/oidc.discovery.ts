import {
  allowInsecureRequests,
  type Configuration,
  discovery,
} from "openid-client";
import type { ResolvedIdClientOptions } from "./oidc.options";

const JWT_SEGMENTS = 3;

const cache = new Map<string, Promise<Configuration>>();

/**
 * One discovery per `(issuer, clientId)` per process. Hydra's
 * `/.well-known/openid-configuration` is stable, and fetching it on every login
 * adds a round trip to the slowest part of the flow.
 */
export function getConfiguration(
  options: ResolvedIdClientOptions
): Promise<Configuration> {
  const key = `${options.issuer}::${options.clientId}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  // Read the secret before caching, so a missing one throws without poisoning
  // the entry: once the variable is set, the next request gets a clean attempt
  // instead of the remembered failure.
  const secret = options.getClientSecret();
  const entry = discovery(
    new URL(options.issuer),
    options.clientId,
    secret,
    undefined,
    // Plain http is local-only. Deployed issuers are https, where this is a
    // no-op, so it is keyed off the issuer rather than off an extra flag
    // somebody has to remember to unset.
    options.issuer.startsWith("http://")
      ? { execute: [allowInsecureRequests] }
      : undefined
  ).catch((error: unknown) => {
    // A cold start that raced Hydra, a DNS blip, a not-yet-ready issuer: all
    // transient, and none should disable login until the process restarts.
    cache.delete(key);
    throw error;
  });
  cache.set(key, entry);
  return entry;
}

/**
 * The `exp` claim, for sizing the access cookie. Hydra issues JWTs here, but
 * this stays best-effort: a deployment configured for opaque tokens must degrade
 * to a conservative lifetime rather than throw.
 */
export function readExpiry(token: string): number | null {
  const exp = readClaims(token)?.exp;
  return typeof exp === "number" ? exp : null;
}

/** The `aal` the issuer stated, flat or under `ext` where Hydra nests consent's claims. */
export function readAal(token: string): string | null {
  const claims = readClaims(token);
  const flat = claims?.aal;
  if (typeof flat === "string" && flat) {
    return flat;
  }
  const ext = claims?.ext;
  const nested =
    ext && typeof ext === "object"
      ? (ext as Record<string, unknown>).aal
      : undefined;
  return typeof nested === "string" && nested ? nested : null;
}

const AAL_PATTERN = /^aal(\d+)$/;

/** A floor: a token that stepped higher still passes. Unknown spellings compare by equality. */
export function meetsAal(actual: string | null, required: string): boolean {
  const left = AAL_PATTERN.exec(actual ?? "")?.[1];
  const right = AAL_PATTERN.exec(required)?.[1];
  if (!(left && right)) {
    return actual === required;
  }
  return Number(left) >= Number(right);
}

function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== JWT_SEGMENTS) {
    return null;
  }
  try {
    const payload = parts[1] ?? "";
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(
      Buffer.from(
        padded.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      ).toString()
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}
