import { Configuration, IdentityApi } from "@ory/client-fetch";
import { env } from "./env";
import { gcpAuthMiddleware } from "./gcp-identity-token";

/**
 * Kratos admin. Server-side only, and never reachable from the browser: the
 * service accepts no anonymous invocation, so every call carries a
 * Google-signed identity token minted for its audience.
 */
export const identityAdmin = new IdentityApi(
  new Configuration({
    basePath: env.kratosAdminUrl,
    middleware: [gcpAuthMiddleware(env.kratosAdminUrl)],
  })
);
