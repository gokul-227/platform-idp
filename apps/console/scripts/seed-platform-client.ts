/**
 * Register this console as an OAuth2 client of its own issuer, so `/admin/*`
 * is reached as the signed-in operator.
 *
 * Idempotent by client name, like `apps/id`'s. The secret is shown only on
 * creation; `pnpm ory:reset` mints a fresh client.
 *
 * Nothing on platform's side needs configuring for this to reach `/admin/*`:
 * `StaffGuard` admits an ordinary aal2 token whose identity is on the
 * `staff` schema, which is what every operator signing into this console
 * already is. The client registration below carries no special claim.
 */
import { Configuration, OAuth2Api } from "@ory/client-fetch";

const CLIENT_NAME = "buildos-console-platform";
const CONSOLE_URL = process.env.CONSOLE_URL ?? "http://localhost:3201";
/** Must match `PLATFORM_API_URL`: it is the `aud` the resource server checks. */
const API_AUDIENCE = process.env.PLATFORM_API_URL ?? "http://localhost:3100";

const hydraAdmin = new OAuth2Api(
  new Configuration({
    basePath: process.env.HYDRA_ADMIN_URL ?? "http://localhost:4445",
  })
);

async function main(): Promise<void> {
  const existing = await hydraAdmin.listOAuth2Clients({
    clientName: CLIENT_NAME,
  });
  const first = existing[0];
  if (first) {
    console.log(`client "${CLIENT_NAME}" exists: ${first.client_id}`);
    console.log(
      "secret is shown only on creation; run `pnpm ory:reset` for a fresh one"
    );
    return;
  }

  const client = await hydraAdmin.createOAuth2Client({
    oAuth2Client: {
      client_name: CLIENT_NAME,
      // Hydra drops a requested audience it has not registered, so the token
      // arrives with an empty `aud` and platform refuses it — while the
      // sign-in itself looks perfectly fine.
      audience: [API_AUDIENCE],
      // Both grants on one registration: client_credentials for the service
      // reads, authorization_code for the operator's own token.
      grant_types: [
        "authorization_code",
        "refresh_token",
        "client_credentials",
      ],
      response_types: ["code"],
      scope: "openid email offline_access",
      redirect_uris: [`${CONSOLE_URL}/auth/callback`],
      post_logout_redirect_uris: [`${CONSOLE_URL}/tenancy`],
      // First-party. The login UI answers the challenge from the operator's
      // existing Kratos session only for a client marked this way, which is
      // what keeps the round trip free of a screen.
      skip_consent: true,
      // `client_secret_post`: `openid-client` sends the secret in the body, so
      // a basic registration fails the exchange with `invalid_client` while the
      // authorization succeeds — a redirect loop rather than an error.
      token_endpoint_auth_method: "client_secret_post",
    },
  });
  console.log(`OIDC_CLIENT_ID=${client.client_id}`);
  console.log(`OIDC_CLIENT_SECRET=${client.client_secret}`);
}

await main();
