"use server";

import { revalidatePath } from "next/cache";
import { revokeMyOtherSessions, revokeMySession } from "@/lib/kratos";

export async function revokeSession(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }
  await revokeMySession(id);
  revalidatePath("/account");
}

export async function revokeOtherSessions(): Promise<void> {
  await revokeMyOtherSessions();
  revalidatePath("/account");
}
