import { createRemoteJWKSet, jwtVerify } from "jose";
import { type Principal, toPrincipal } from "./principal";

/**
 * What the API needs to trust a token. Each is also readable from the
 * environment, so a deployment configures this without a code change, and each
 * is required: there is no value for any of them that is safe to guess.
 */
export interface VerifierOptions {
  /** The `aud` this API answers to, which is its own public URL. Env: `OIDC_AUDIENCE`. */
  audience?: string;
  /** Seconds of clock skew tolerated. Default 5. */
  clockTolerance?: number;
  /** The `iss` on a token this API accepts. Env: `OIDC_ISSUER`. */
  issuer?: string;
  /** Where that issuer publishes its signing keys. Env: `OIDC_JWKS_URL`. */
  jwksUrl?: string;
}

export interface ResolvedVerifierOptions {
  readonly audience: string;
  readonly clockTolerance: number;
  readonly issuer: string;
  readonly jwksUrl: string;
}

const DEFAULT_CLOCK_TOLERANCE = 5;

/**
 * Config, or a refusal to start. No localhost defaults: a cleartext loopback issuer
 * makes any process on that port one this API trusts, and every consumer states all
 * three anyway. `||`, not `??`: an empty value is missing rather than valid.
 */
export function resolveVerifierOptions(
  options: VerifierOptions = {}
): ResolvedVerifierOptions {
  return {
    audience: required(
      options.audience || process.env.OIDC_AUDIENCE,
      "audience",
      "OIDC_AUDIENCE",
      "this API's own public URL, which the issuer must also carry on the calling client's registered audience list"
    ),
    clockTolerance: options.clockTolerance ?? DEFAULT_CLOCK_TOLERANCE,
    issuer: required(
      options.issuer || process.env.OIDC_ISSUER,
      "issuer",
      "OIDC_ISSUER",
      "the issuer's public URL, exactly as it spells itself in `iss`"
    ),
    jwksUrl: required(
      options.jwksUrl || process.env.OIDC_JWKS_URL,
      "jwksUrl",
      "OIDC_JWKS_URL",
      "usually the issuer's `/.well-known/jwks.json`"
    ),
  };
}

function required(
  value: string | undefined,
  option: string,
  envVar: string,
  describe: string
): string {
  if (!value) {
    throw new Error(
      `platform-id: ${option} is required. Pass it to PlatformIdModule.forRoot({ ${option} }) or set ${envVar}. It is ${describe}.`
    );
  }
  return value;
}

/** Why a token was refused. For a log; the caller only ever sees 401. */
export type VerificationFailure =
  | "no-token"
  | "bad-signature"
  | "wrong-issuer"
  | "wrong-audience"
  | "expired"
  | "not-a-principal"
  | "keys-unavailable";

export type VerificationResult =
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly reason: VerificationFailure };

/**
 * Verifies a token against the issuer's published keys, which `jose` caches and
 * refetches on an unknown `kid`, so the API answers without asking the identity
 * service. Issuer and audience are pinned, or another service's token is accepted.
 */
export function createVerifier(
  options: VerifierOptions = {}
): (token: string | undefined) => Promise<VerificationResult> {
  const config = resolveVerifierOptions(options);
  // Built once: the instance *is* the cache, so constructing one per request
  // would refetch the key set on every request and defeat the design.
  const keys = createRemoteJWKSet(new URL(config.jwksUrl));

  return async function verify(
    token: string | undefined
  ): Promise<VerificationResult> {
    if (!token) {
      return { ok: false, reason: "no-token" };
    }
    try {
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ["RS256"],
        audience: config.audience,
        clockTolerance: config.clockTolerance,
        issuer: config.issuer,
      });
      const principal = toPrincipal(payload as Record<string, unknown>);
      return principal
        ? { ok: true, principal }
        : { ok: false, reason: "not-a-principal" };
    } catch (error) {
      return { ok: false, reason: classify(error) };
    }
  };
}

/** `jose` codes, mapped to something a log line can be grepped for. */
function classify(error: unknown): VerificationFailure {
  const code = (error as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return "expired";
    case "ERR_JWKS_NO_MATCHING_KEY":
    case "ERR_JWKS_TIMEOUT":
    case "ERR_JWKS_INVALID":
      // The keys could not be reached or did not contain the signing key. Not
      // the caller's fault and not a reason to admit them, but worth telling
      // apart from a forged signature when reading logs.
      return "keys-unavailable";
    default:
      break;
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes('"iss"')) {
    return "wrong-issuer";
  }
  if (message.includes('"aud"')) {
    return "wrong-audience";
  }
  return "bad-signature";
}

/** `Authorization: Bearer <token>`, case-insensitively, or undefined. */
export function bearerFrom(header: string | undefined): string | undefined {
  if (!header) {
    return;
  }
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return;
  }
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : undefined;
}
