import { requireAdminClient } from "@/lib/platform.admin.client";
import { isPlatformAuthConfigured } from "@/lib/platform.auth";

/**
 * The platform's profile row, removed before the identity is: the platform
 * refuses a last owner, and that refusal has to come while the account still
 * exists to hand over from. Idempotent: an identity that never signed in has
 * no row, and nothing happens. A console registered with no platform keeps no
 * profiles either, so there is nothing to ask.
 */
export async function removePlatformProfile(externalId: string): Promise<void> {
  if (!isPlatformAuthConfigured()) {
    return;
  }
  const admin = await requireAdminClient();
  const { items } = await admin.users.list({ externalId: `eq.${externalId}` });
  const profile = items[0];
  if (profile) {
    await admin.users.delete(profile.id);
  }
}
