import { Configuration, IdentityApi } from "@ory/client-fetch";
import { env } from "./env";
import { gcpAuthMiddleware } from "./gcp-identity-token";
import { getSession } from "./kratos";
import { removePlatformProfile } from "./platform.profile";

/**
 * Closing your own account, and the one place this app touches Kratos admin:
 * Kratos has no self-service deletion flow, so this is an admin call on the
 * visitor's behalf or it is nothing.
 *
 * What keeps it narrow is that the client is private to this module and nothing
 * exported takes an identity id, so the only account it can delete is the one
 * asking. A general `identityAdmin` export would be the whole capability.
 */
const identityAdmin = new IdentityApi(
  new Configuration({
    basePath: env.kratosAdminUrl,
    middleware: [gcpAuthMiddleware(env.kratosAdminUrl)],
  })
);

export type AccountDeletion =
  | { type: "deleted" }
  | { type: "sole-owner"; authorities: { id: string; name: string }[] }
  | { type: "failed"; reason: string };

/**
 * The downstream profile first, the identity only if it agreed. Same order the
 * console deletes in: the platform routinely refuses to remove a last owner, and
 * reversed that leaves the identity gone and its profile unreachable.
 */
export async function deleteOwnAccount(): Promise<AccountDeletion> {
  // Read here rather than accepted as an argument. The docstring above promised
  // nothing exported takes an identity id, and a parameter made that promise a
  // comment: correct only while every caller kept passing its own subject.
  const identityId = (await getSession())?.identity?.id;
  if (!identityId) {
    return { type: "failed", reason: "no-session" };
  }
  const removal = await removePlatformProfile(identityId);
  if (removal.type === "blocked") {
    return { type: "sole-owner", authorities: removal.authorities };
  }
  if (removal.type === "failed") {
    return { type: "failed", reason: removal.reason };
  }

  try {
    await identityAdmin.deleteIdentity({ id: identityId });
  } catch (error) {
    // The profile is already gone and the identity is not, which the login hook
    // repairs on the next sign-in. Saying so beats a silent success.
    return {
      type: "failed",
      reason: error instanceof Error ? error.message : "unknown",
    };
  }
  return { type: "deleted" };
}
