"use server";

import { revalidatePath } from "next/cache";

import {
  createIdentity,
  deleteIdentity,
  disableIdentity,
  enableIdentity,
} from "@/adapters/console-api";

export async function createIdentityAction(formData: FormData): Promise<void> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email === "string" && email) {
    await createIdentity(
      email,
      typeof password === "string" && password ? password : undefined,
    );
  }
  revalidatePath("/console/identities");
}

export async function setIdentityEnabledAction(formData: FormData): Promise<void> {
  const identityId = formData.get("id");
  const enabled = formData.get("enabled") === "true";
  if (typeof identityId === "string" && identityId) {
    await (enabled ? enableIdentity(identityId) : disableIdentity(identityId));
  }
  revalidatePath("/console/identities");
}

export async function deleteIdentityAction(formData: FormData): Promise<void> {
  const identityId = formData.get("id");
  if (typeof identityId === "string" && identityId) {
    await deleteIdentity(identityId);
  }
  revalidatePath("/console/identities");
}
