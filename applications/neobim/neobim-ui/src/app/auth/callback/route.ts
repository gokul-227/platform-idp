import * as client from "openid-client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { discoverHydra, oidcEnv, publicOrigin } from "@/lib/oidc-config";
import { setSession } from "@/lib/session";

export async function GET(request: Request): Promise<NextResponse> {
  const env = oidcEnv();
  const origin = publicOrigin(env);
  const store = await cookies();
  const codeVerifier = store.get("neobim_pkce_verifier")?.value;
  const expectedState = store.get("neobim_oauth_state")?.value;
  store.delete("neobim_pkce_verifier");
  store.delete("neobim_oauth_state");

  if (!codeVerifier || !expectedState) {
    return NextResponse.redirect(new URL("/?error=missing_pkce_state", origin));
  }

  const config = await discoverHydra(env);

  // `request.url` reflects this container's internal hostname:port (e.g.
  // http://<container-id>:3000/...) rather than the public
  // NEOBIM_REDIRECT_URI — confirmed live via debug logging.
  // authorizationCodeGrant derives redirect_uri from its `currentUrl`
  // argument's origin regardless of any explicit tokenEndpointParameters
  // override, so the fix is to rebuild the callback URL with the correct
  // (public) origin, keeping only the query string (code/state/iss) from
  // the real incoming request.
  const callbackUrl = new URL(env.redirectUri);
  callbackUrl.search = new URL(request.url).search;

  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
  });

  const claims = tokens.claims();
  await setSession({
    sub: String(claims?.sub ?? ""),
    email: (claims?.email as string | undefined) ?? null,
    name: (claims?.name as string | undefined) ?? null,
  });

  return NextResponse.redirect(new URL("/account", origin));
}
