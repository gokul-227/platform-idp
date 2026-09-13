import "server-only";

import { AdminClient } from "@aec-craft/platform-admin-sdk";
import { env } from "./env";
import { platformAuth } from "./platform.auth";

/**
 * The staff surface as the signed-in operator, for the server side of a write
 * the browser cannot make alone. Pages read and write through the relay
 * (`app/api/[...path]`) and the SDK's hooks instead; `proxy.ts` obtains the
 * token before any page renders, so a missing one here is a session that
 * expired mid-request.
 */
export async function requireAdminClient(): Promise<AdminClient> {
  const session = await platformAuth.getSession();
  const accessToken = session?.accessToken;
  if (!accessToken) {
    throw new Error(
      "This console holds no platform token for you. Reload the page, then try again."
    );
  }
  return new AdminClient({
    baseUrl: env.platformApiUrl,
    getAuthHeaders: async () => ({ authorization: `Bearer ${accessToken}` }),
  });
}
