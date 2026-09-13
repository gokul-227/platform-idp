import type { BrowserFlow, FlowSearchParams } from "./kratos";

/**
 * What this sign-in belongs to, as query parameters Kratos accepts when it mints
 * a flow: the OAuth2 login challenge, and where the flow was told to return.
 * Both are stated once, on the way in, and then live only on the flow record.
 */
function requestParams(flow: BrowserFlow): URLSearchParams {
  const query = new URLSearchParams();
  const challenge =
    "oauth2_login_challenge" in flow ? flow.oauth2_login_challenge : undefined;
  if (challenge) {
    query.set("login_challenge", challenge);
  }
  if (flow.return_to) {
    query.set("return_to", flow.return_to);
  }
  return query;
}

/**
 * The address this flow should be at, or null when it is already there. Kratos
 * redirects here with `?flow=` alone and a replacement flow is minted from the
 * URL, so what the URL omits is dropped the moment the flow expires: the sign-in
 * completes as an ordinary one with the application forgotten. Presence decides,
 * never equality, or a value Kratos spells back differently redirects for ever.
 */
export function healedAddress(
  flow: BrowserFlow,
  params: FlowSearchParams
): string | null {
  const carried = requestParams(flow);
  const isMissing = [...carried.keys()].some((key) => !params[key]);
  if (!isMissing) {
    return null;
  }
  const query = new URLSearchParams({ flow: flow.id });
  for (const [key, value] of carried) {
    query.set(key, value);
  }
  return `/login?${query}`;
}

/**
 * Where "use a different account" goes: a fresh flow for the same request, so
 * choosing another account still returns to the application that asked.
 */
export function restartAddress(flow: BrowserFlow): string {
  const carried = requestParams(flow);
  return carried.size > 0 ? `/login?${carried}` : "/login";
}
