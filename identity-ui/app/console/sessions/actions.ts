"use server";

import { revalidatePath } from "next/cache";

import { revokeAdminSession, revokeAllSessionsForIdentity } from "@/adapters/console-api";

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const sessionId = formData.get("id");
  if (typeof sessionId === "string" && sessionId) {
    await revokeAdminSession(sessionId);
  }
  revalidatePath("/console/sessions");
}

export async function revokeAllSessionsAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId === "string" && identityId) {
    await revokeAllSessionsForIdentity(identityId);
  }
  revalidatePath("/console/sessions");
}
