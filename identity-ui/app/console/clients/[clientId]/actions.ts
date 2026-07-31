"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteClient, rotateClientSecret, updateClient } from "@/adapters/console-api";

function splitList(value: FormDataEntryValue | null): string[] {
  return typeof value === "string"
    ? value.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
}

export async function updateClientDetailAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId !== "string" || !clientId) return;

  const result = await updateClient(clientId, {
    audience: splitList(formData.get("audience")),
    authorizationCodeGrantAccessTokenLifespan: String(formData.get("ac_access_ttl") ?? ""),
    authorizationCodeGrantIdTokenLifespan: String(formData.get("ac_id_ttl") ?? ""),
    authorizationCodeGrantRefreshTokenLifespan: String(formData.get("ac_refresh_ttl") ?? ""),
    clientCredentialsGrantAccessTokenLifespan: String(formData.get("cc_access_ttl") ?? ""),
    clientName: String(formData.get("client_name") ?? clientId),
    grantTypes: splitList(formData.get("grant_types")),
    jwksUri: String(formData.get("jwks_uri") ?? ""),
    postLogoutRedirectUris: splitList(formData.get("post_logout_redirect_uris")),
    redirectUris: splitList(formData.get("redirect_uris")),
    refreshTokenGrantAccessTokenLifespan: String(formData.get("rt_access_ttl") ?? ""),
    refreshTokenGrantIdTokenLifespan: String(formData.get("rt_id_ttl") ?? ""),
    refreshTokenGrantRefreshTokenLifespan: String(formData.get("rt_refresh_ttl") ?? ""),
    responseTypes: splitList(formData.get("response_types")),
    scope: String(formData.get("scope") ?? ""),
    tokenEndpointAuthMethod: String(formData.get("token_endpoint_auth_method") ?? "client_secret_post"),
  });

  if (!result.ok) {
    redirect(`/console/clients/${clientId}?error=${encodeURIComponent(result.error ?? "Failed to update client")}`);
  }
  revalidatePath(`/console/clients/${clientId}`);
  redirect(`/console/clients/${clientId}?saved=1`);
}

export async function rotateClientDetailSecretAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId !== "string" || !clientId) return;
  const result = await rotateClientSecret(clientId);
  if (result.ok && result.data) {
    redirect(`/console/clients/${clientId}?secret=${encodeURIComponent(result.data.client_secret)}`);
  }
  revalidatePath(`/console/clients/${clientId}`);
}

export async function deleteClientDetailAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId !== "string" || !clientId) return;
  await deleteClient(clientId);
  redirect("/console/clients");
}
