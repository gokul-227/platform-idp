"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import {
  createRegistryApp,
  deleteRegistryApp,
  setAppEnabled,
  updateRegistryApp,
} from "@/adapters/app-registry";

export async function setAppEnabledAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const enabled = formData.get("enabled") === "true";
  if (typeof clientId === "string" && clientId) {
    await setAppEnabled(clientId, enabled);
  }
  revalidatePath("/console/applications");
}

export async function createAppAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const clientName = formData.get("client_name");
  const redirectUris = formData.get("redirect_uris");
  const scope = formData.get("scope");
  if (
    typeof clientId === "string" &&
    clientId &&
    typeof clientName === "string" &&
    clientName
  ) {
    await createRegistryApp({
      clientId,
      clientName,
      redirectUris:
        typeof redirectUris === "string"
          ? redirectUris.split(",").map((uri) => uri.trim()).filter(Boolean)
          : [],
      scope: typeof scope === "string" && scope ? scope : "openid profile email",
    });
  }
  revalidatePath("/console/applications");
}

export async function updateAppAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  const clientName = formData.get("client_name");
  const redirectUris = formData.get("redirect_uris");
  const scope = formData.get("scope");
  const tags = formData.get("tags");
  if (
    typeof clientId === "string" &&
    clientId &&
    typeof clientName === "string" &&
    clientName
  ) {
    await updateRegistryApp({
      clientId,
      clientName,
      redirectUris:
        typeof redirectUris === "string"
          ? redirectUris.split(",").map((uri) => uri.trim()).filter(Boolean)
          : [],
      scope: typeof scope === "string" && scope ? scope : "openid profile email",
      tags:
        typeof tags === "string"
          ? tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [],
    });
  }
  revalidatePath("/console/applications");
  redirect("/console/applications");
}

export async function deleteAppAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId === "string" && clientId) {
    await deleteRegistryApp(clientId);
  }
  revalidatePath("/console/applications");
}
