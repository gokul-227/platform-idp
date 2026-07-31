"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import {
  deleteIdentity,
  disableIdentity,
  enableIdentity,
  forceVerifyIdentity,
  resetIdentityPassword,
  revokeAdminSession,
  revokeAllSessionsForIdentity,
  updateIdentityTraits,
} from "@/adapters/console-api";

export async function updateTraitsAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  const email = formData.get("email");
  if (typeof identityId === "string" && identityId && typeof email === "string" && email) {
    await updateIdentityTraits(identityId, { email });
  }
  revalidatePath(`/console/identities/${identityId}`);
}

export async function forceVerifyAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId === "string" && identityId) {
    await forceVerifyIdentity(identityId);
  }
  revalidatePath(`/console/identities/${identityId}`);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  const password = formData.get("password");
  if (
    typeof identityId === "string" &&
    identityId &&
    typeof password === "string" &&
    password
  ) {
    await resetIdentityPassword(identityId, password);
  }
  revalidatePath(`/console/identities/${identityId}`);
}

export async function setEnabledDetailAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  const enabled = formData.get("enabled") === "true";
  if (typeof identityId === "string" && identityId) {
    await (enabled ? enableIdentity(identityId) : disableIdentity(identityId));
  }
  revalidatePath(`/console/identities/${identityId}`);
}

export async function deleteIdentityDetailAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId === "string" && identityId) {
    await deleteIdentity(identityId);
  }
  redirect("/console/identities");
}

export async function revokeSessionDetailAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  const sessionId = formData.get("session_id");
  if (typeof sessionId === "string" && sessionId) {
    await revokeAdminSession(sessionId);
  }
  revalidatePath(`/console/identities/${identityId}`);
}

export async function revokeAllSessionsDetailAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId === "string" && identityId) {
    await revokeAllSessionsForIdentity(identityId);
  }
  revalidatePath(`/console/identities/${identityId}`);
}
