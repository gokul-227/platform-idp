import { Configuration, OAuth2Api } from "@ory/client-fetch";
import { env } from "./env";
import { gcpAuthMiddleware } from "./gcp-identity-token";

/** Hydra admin. Same posture as Kratos admin: IAM-gated, token per call. */
export const hydraAdmin = new OAuth2Api(
  new Configuration({
    basePath: env.hydraAdminUrl,
    middleware: [gcpAuthMiddleware(env.hydraAdminUrl)],
  })
);
