import * as client from "openid-client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { discoverHydra, oidcEnv } from "@/lib/oidc-config";

export async function GET(): Promise<NextResponse> {
  const env = oidcEnv();
  const config = await discoverHydra(env);

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: env.redirectUri,
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const store = await cookies();
  // Short-lived, httpOnly — only needed for the few seconds of the redirect
  // round-trip to Hydra/Kratos and back.
  store.set("neobim_pkce_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  store.set("neobim_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authUrl);
}
