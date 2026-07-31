"use server";

import { revalidatePath } from "next/cache";

import { sendTestNotification, updateTemplate } from "@/adapters/notification-service";

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const content = formData.get("content");
  if (typeof id === "string" && id && typeof content === "string") {
    await updateTemplate(id, content);
  }
  revalidatePath("/console/notifications");
}

export async function sendTestNotificationAction(formData: FormData): Promise<void> {
  const recipient = formData.get("recipient");
  if (typeof recipient === "string" && recipient) {
    await sendTestNotification(recipient);
  }
  revalidatePath("/console/notifications");
}
