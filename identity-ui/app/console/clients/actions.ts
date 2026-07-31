"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient, deleteClient, rotateClientSecret } from "@/adapters/console-api";

export async function createClientAction(formData: FormData): Promise<void> {
  const clientName = formData.get("client_name");
  const redirectUris = formData.get("redirect_uris");
  const scope = formData.get("scope");
  if (typeof clientName === "string" && clientName) {
    const result = await createClient({
      clientName,
      redirectUris:
        typeof redirectUris === "string"
          ? redirectUris.split(",").map((uri) => uri.trim()).filter(Boolean)
          : [],
      scope: typeof scope === "string" && scope ? scope : "openid profile email",
    });
    if (result.ok && result.data) {
      redirect(
        `/console/clients?created=${result.data.client_id}&secret=${encodeURIComponent(result.data.client_secret)}`,
      );
    }
  }
  revalidatePath("/console/clients");
}

export async function rotateClientSecretAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId === "string" && clientId) {
    const result = await rotateClientSecret(clientId);
    if (result.ok && result.data) {
      redirect(
        `/console/clients?created=${clientId}&secret=${encodeURIComponent(result.data.client_secret)}`,
      );
    }
  }
  revalidatePath("/console/clients");
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const clientId = formData.get("client_id");
  if (typeof clientId === "string" && clientId) {
    await deleteClient(clientId);
  }
  revalidatePath("/console/clients");
}
