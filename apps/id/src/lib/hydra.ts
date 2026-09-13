import { Configuration, OAuth2Api } from "@ory/client-fetch";
import { env } from "./env";
import { gcpAuthMiddleware } from "./gcp-identity-token";

/**
 * Hydra admin, the only privileged reach this internet-facing app has, and the
 * consent contract is what requires it: the endpoints that read and complete a
 * challenge live on the admin API alone, with no public counterpart.
 *
 * Server-side only, every call carrying an identity token minted for the target's
 * audience. Kratos admin is deliberately absent, so this surface cannot delete an
 * identity or mint a recovery link.
 */
export const hydraAdmin = new OAuth2Api(
  new Configuration({
    basePath: env.hydraAdminUrl,
    middleware: [gcpAuthMiddleware(env.hydraAdminUrl)],
  })
);
