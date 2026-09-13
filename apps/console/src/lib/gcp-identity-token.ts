/**
 * Service-to-service auth for the Ory admin APIs, which authenticate nobody: the
 * control is Cloud Run IAM, and a caller presents a metadata-minted token for the
 * target's audience, so no key material exists.
 *
 * Outside Cloud Run there is no metadata server and this returns null: right for a
 * loopback admin port, a fault when deployed, and `K_SERVICE` tells them apart.
 * Duplicated in both apps as deployment plumbing rather than a contract.
 */

const LOG_PREFIX = "[gcp-identity-token]";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

interface CachedToken {
  /** Epoch ms. Refreshed early, since a token rejected mid-request is a 403. */
  refreshAfter: number;
  token: string;
}

const cache = new Map<string, CachedToken>();

/** Tokens last an hour; refresh at five minutes remaining. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const ASSUMED_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Cloud Run sets `K_SERVICE`, so its absence is local development rather than a
 * broken metadata server. Without the distinction an unauthenticated call looks
 * the same in both, and the deployed one is a 403 nothing explains.
 */
function unavailable(audience: string, reason: string): null {
  if (process.env.K_SERVICE) {
    console.error(
      `${LOG_PREFIX} no identity token for ${audience}: ${reason}. The call will be refused with 403.`
    );
  }
  return null;
}

export async function identityTokenFor(
  audience: string
): Promise<string | null> {
  const cached = cache.get(audience);
  if (cached && Date.now() < cached.refreshAfter) {
    return cached.token;
  }

  try {
    const response = await fetch(
      `${METADATA_TOKEN_URL}?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }
    );
    if (!response.ok) {
      return unavailable(
        audience,
        `metadata server answered ${response.status}`
      );
    }
    const token = (await response.text()).trim();
    if (!token) {
      return unavailable(audience, "metadata server answered with nothing");
    }
    cache.set(audience, {
      token,
      refreshAfter: Date.now() + ASSUMED_LIFETIME_MS - REFRESH_MARGIN_MS,
    });
    return token;
  } catch (error) {
    return unavailable(
      audience,
      error instanceof Error ? error.message : "unreachable"
    );
  }
}

/**
 * `@ory/client-fetch` middleware that attaches the token. The audience is the
 * service's own base URL, which is what Cloud Run validates against.
 */
export function gcpAuthMiddleware(baseUrl: string) {
  return {
    pre: async (context: { url: string; init: RequestInit }) => {
      const token = await identityTokenFor(baseUrl);
      if (!token) {
        return context;
      }
      return {
        ...context,
        init: {
          ...context.init,
          headers: {
            ...(context.init.headers as Record<string, string> | undefined),
            Authorization: `Bearer ${token}`,
          },
        },
      };
    },
  };
}
