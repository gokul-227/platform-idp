"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createApiKey,
  deleteApiKey,
  getOidcDiscovery,
  provisionPkceClient,
  refreshAccessToken,
  setApiKeyEnabled,
  testClientCredentialsToken,
} from "@/adapters/developer";
import { getEnv } from "@/config/env";
import { OAUTH_PLAYGROUND_COOKIE } from "./oauth-playground.constants";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Starts a real Authorization Code + PKCE flow against Hydra: provisions a
// real public (token_endpoint_auth_method: none) OAuth2 client scoped to
// this exact callback URL, generates a real PKCE verifier/challenge pair,
// stores the verifier + state server-side in an httpOnly cookie (never
// exposed to the browser's URL bar), and redirects to Hydra's real
// /oauth2/auth — the same endpoint any external app would use.
export async function startAuthorizationCodeFlowAction(formData: FormData): Promise<void> {
  const scope = String(formData.get("scope") ?? "openid offline_access");
  const redirectUri = `${getEnv().publicBaseUrl}/auth/console/developer/callback`;

  const provisioned = await provisionPkceClient(redirectUri, scope);
  if (!provisioned.ok || !provisioned.clientId) {
    redirect(
      `/console/developer?error=${encodeURIComponent(provisioned.error ?? "Failed to provision a test client")}`,
    );
  }

  const discovery = await getOidcDiscovery();
  if (!discovery?.authorization_endpoint) {
    redirect("/console/developer?error=Discovery+document+unavailable");
  }

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const state = base64url(randomBytes(16));

  const cookieStore = await cookies();
  cookieStore.set(
    OAUTH_PLAYGROUND_COOKIE,
    JSON.stringify({ clientId: provisioned.clientId, codeVerifier, redirectUri, state }),
    { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" },
  );

  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", provisioned.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  redirect(authUrl.toString());
}

export async function refreshPlaygroundTokenAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  const refreshToken = String(formData.get("refresh_token") ?? "");
  if (!clientId || !refreshToken) {
    redirect("/console/developer?error=Missing+client_id+or+refresh_token");
  }
  const result = await refreshAccessToken(clientId, refreshToken);
  if (!result.ok || !result.tokens) {
    redirect(`/console/developer?error=${encodeURIComponent(result.error ?? "Refresh failed")}`);
  }
  redirect(
    `/console/developer?refreshed_access_token=${encodeURIComponent(result.tokens.access_token ?? "")}`,
  );
}

export async function createApiKeyAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const expiresAt = formData.get("expires_at");
  if (!name) {
    redirect("/console/developer?error=Name+is+required");
  }
  const result = await createApiKey(
    name, scope, typeof expiresAt === "string" && expiresAt ? expiresAt : null,
  );
  if (result.ok && result.apiKey) {
    redirect(
      `/console/developer?created=${result.apiKey.client_id}&secret=${encodeURIComponent(result.apiKey.client_secret)}`,
    );
  }
  redirect(`/console/developer?error=${encodeURIComponent(result.error ?? "Unknown error")}`);
}

export async function setApiKeyEnabledAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const enabled = formData.get("enabled");
  if (typeof clientId === "string" && clientId && typeof enabled === "string") {
    await setApiKeyEnabled(clientId, enabled === "true");
  }
  revalidatePath("/console/developer");
}

export async function deleteApiKeyAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId === "string" && clientId) {
    await deleteApiKey(clientId);
  }
  revalidatePath("/console/developer");
}

export async function testTokenAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  const clientSecret = String(formData.get("client_secret") ?? "");
  const scope = String(formData.get("scope") ?? "openid");

  if (!clientId || !clientSecret) {
    redirect("/console/developer?error=Client+ID+and+secret+are+required");
  }

  const result = await testClientCredentialsToken(clientId, clientSecret, scope);
  if (result.ok) {
    redirect(
      `/console/developer?token=${encodeURIComponent(result.accessToken ?? "")}&scope=${encodeURIComponent(result.scope ?? "")}`,
    );
  }
  redirect(`/console/developer?error=${encodeURIComponent(result.error ?? "Unknown error")}`);
}
