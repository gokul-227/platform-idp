"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createRelationTuple,
  deleteRelationTuple,
  rotateClientSecret,
  updateClient,
} from "@/adapters/console-api";
import { deleteRegistryApp, setAppEnabled } from "@/adapters/app-registry";

function splitList(value: FormDataEntryValue | null): string[] {
  return typeof value === "string"
    ? value.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
}

export async function updateApplicationOAuthAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const clientName = formData.get("client_name");
  if (typeof clientId !== "string" || !clientId) return;

  const result = await updateClient(clientId, {
    audience: splitList(formData.get("audience")),
    authorizationCodeGrantAccessTokenLifespan: String(formData.get("ac_access_ttl") ?? ""),
    authorizationCodeGrantIdTokenLifespan: String(formData.get("ac_id_ttl") ?? ""),
    authorizationCodeGrantRefreshTokenLifespan: String(formData.get("ac_refresh_ttl") ?? ""),
    clientCredentialsGrantAccessTokenLifespan: String(formData.get("cc_access_ttl") ?? ""),
    clientName: typeof clientName === "string" && clientName ? clientName : clientId,
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
    redirect(
      `/console/applications/${clientId}?error=${encodeURIComponent(result.error ?? "Failed to update client")}`,
    );
  }
  revalidatePath(`/console/applications/${clientId}`);
}

export async function grantApplicationPermissionAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const relation = formData.get("relation");
  const subjectId = formData.get("subject_id");
  if (
    typeof clientId === "string" && clientId &&
    typeof relation === "string" && relation &&
    typeof subjectId === "string" && subjectId
  ) {
    await createRelationTuple({
      namespace: "Application", object: clientId, relation, subjectId,
    });
  }
  if (typeof clientId === "string") {
    revalidatePath(`/console/applications/${clientId}`);
  }
}

export async function revokeApplicationPermissionAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const relation = formData.get("relation");
  const subjectId = formData.get("subject_id");
  if (
    typeof clientId === "string" && clientId &&
    typeof relation === "string" && relation &&
    typeof subjectId === "string" && subjectId
  ) {
    await deleteRelationTuple({
      namespace: "Application", object: clientId, relation, subjectId,
    });
  }
  if (typeof clientId === "string") {
    revalidatePath(`/console/applications/${clientId}`);
  }
}

export async function setApplicationEnabledDetailAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const enabled = formData.get("enabled");
  if (typeof clientId === "string" && clientId && typeof enabled === "string") {
    await setAppEnabled(clientId, enabled === "true");
  }
  if (typeof clientId === "string") {
    revalidatePath(`/console/applications/${clientId}`);
  }
}

export async function rotateApplicationSecretAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId !== "string" || !clientId) return;
  const result = await rotateClientSecret(clientId);
  if (result.ok && result.data?.client_secret) {
    redirect(
      `/console/applications/${clientId}?rotated_secret=${encodeURIComponent(result.data.client_secret)}`,
    );
  }
  redirect(
    `/console/applications/${clientId}?error=${encodeURIComponent(result.error ?? "Failed to rotate secret")}`,
  );
}

export async function deleteApplicationDetailAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId === "string" && clientId) {
    await deleteRegistryApp(clientId);
  }
  revalidatePath("/console/applications");
  redirect("/console/applications");
}
