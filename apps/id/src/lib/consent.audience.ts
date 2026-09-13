import type { OAuth2ConsentRequest } from "@ory/client-fetch";

/**
 * The audience a consent grants, honouring RFC 8707 resource indicators: Hydra
 * reads its own `audience` and ignores `resource`, so a client asking the standard
 * way leaves with `aud: []` and every call after a perfect-looking sign-in 401s.
 *
 * With no requested audience, the indicators are read off the authorize URL Hydra
 * hands over, and kept only where the client is registered, which stays the ceiling.
 */
export function grantedAudience(consent: OAuth2ConsentRequest): string[] {
  const requested = consent.requested_access_token_audience ?? [];
  if (requested.length > 0) {
    return requested;
  }
  // Matched without the trailing slash and granted in the registered spelling: a
  // client derives `https://host/` from an origin while the audience is pinned as
  // `https://host`, so a literal comparison grants nothing and the sent form mints
  // an `aud` the resource server refuses.
  const registered = new Map(
    (consent.client?.audience ?? []).map((audience) => [
      withoutTrailingSlash(audience),
      audience,
    ])
  );
  return resourceIndicators(consent.request_url)
    .map((resource) => registered.get(withoutTrailingSlash(resource)))
    .filter((audience): audience is string => audience !== undefined);
}

const TRAILING_SLASHES = /\/+$/;

function withoutTrailingSlash(url: string): string {
  return url.replace(TRAILING_SLASHES, "");
}

/** `resource` may repeat; RFC 8707 allows one token to name several. */
function resourceIndicators(requestUrl: string | undefined): string[] {
  if (!requestUrl) {
    return [];
  }
  try {
    return new URL(requestUrl).searchParams.getAll("resource");
  } catch {
    // Hydra gives an absolute URL. One that does not parse is not worth
    // failing a sign-in over, and grants nothing.
    return [];
  }
}
