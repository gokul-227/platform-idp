/**
 * Register this app as an OAuth2 client of its own issuer, so a page in
 * `apps/id` can call platform's API as the signed-in person.
 *
 * Idempotent by client name, like `seed-oauth-client.ts`. The secret is shown
 * only on creation, because Hydra does not return it again; `pnpm ory:reset`
 * mints a fresh client.
 *
 * Print the two values into the app's environment as `OIDC_CLIENT_ID` and
 * `OIDC_CLIENT_SECRET`. They are deliberately not written to a file here: a
 * secret belongs in the environment or a secret store, which is the same rule
 * `.env.example` states for Kratos's courier credentials.
 */
import { Configuration, OAuth2Api } from "@ory/client-fetch";

const CLIENT_NAME = "buildos-id-platform";
const APP_URL = process.env.APP_URL ?? "http://localhost:3200";
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
      // Hydra drops a requested audience that is not registered here, so the
      // token arrives with an empty `aud` and platform refuses it — while the
      // sign-in itself looks perfectly fine.
      audience: [API_AUDIENCE],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // `offline_access` is what yields a refresh token. Without it the visitor
      // is sent back through authorization every ten minutes, which is Hydra's
      // configured access-token lifetime here.
      scope: "openid email offline_access",
      redirect_uris: [`${APP_URL}/auth/callback`],
      post_logout_redirect_uris: [`${APP_URL}/tenancy`],
      // First-party: this app and the issuer are the same product, so there is
      // no third party for the person to consent to. The consent page already
      // honours this flag (`skip_consent`), which is what keeps the round trip
      // free of a screen nobody would understand.
      skip_consent: true,
      // `client_secret_post`, and this is not a preference. `openid-client` —
      // which `@aec-craft/platform-id-client-nextjs` uses — sends the secret in
      // the body when constructed with a plain secret string, so a client
      // registered as `client_secret_basic` refuses the token exchange with
      // `invalid_client`: "supports 'client_secret_basic', but method
      // 'client_secret_post' was requested". The authorization itself succeeds,
      // so the symptom is not an error page but a redirect loop — the callback
      // fails, sends the visitor to the login route, and the whole flow starts
      // again. `apps/console`'s own platform client records the same finding
      // against this issuer from the other direction.
      token_endpoint_auth_method: "client_secret_post",
    },
  });
  console.log(`OIDC_CLIENT_ID=${client.client_id}`);
  console.log(`OIDC_CLIENT_SECRET=${client.client_secret}`);
}

await main();
