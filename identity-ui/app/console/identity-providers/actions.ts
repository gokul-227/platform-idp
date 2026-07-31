"use server";

import { revalidatePath } from "next/cache";

import { setIdentityProviderEnabled } from "@/adapters/identity-providers";

export async function setProviderEnabledAction(formData: FormData): Promise<void> {
  const providerId = formData.get("provider_id");
  const enabled = formData.get("enabled") === "true";
  if (typeof providerId === "string" && providerId) {
    await setIdentityProviderEnabled(providerId, enabled);
  }
  revalidatePath("/console/identity-providers");
}
