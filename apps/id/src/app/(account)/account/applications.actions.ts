"use server";

import { revalidatePath } from "next/cache";
import { hydraAdmin } from "@/lib/hydra";
import { getSession } from "@/lib/kratos";

/**
 * Take an application's access away. The subject comes from the session and never
 * the form, so a tampered field can only name a client this person never granted.
 *
 * This ends the grant and the refresh token, not an access token already issued:
 * a resource server verifies that locally, so it stays valid for its ten minutes.
 */
export async function revokeApplication(formData: FormData): Promise<void> {
  const client = String(formData.get("client") ?? "");
  if (!client) {
    return;
  }
  const session = await getSession();
  const subject = session?.identity?.id;
  if (!subject) {
    return;
  }
  await hydraAdmin.revokeOAuth2ConsentSessions({ subject, client });
  revalidatePath("/account");
}
