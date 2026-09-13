/**
 * Seed an OAuth2 client for the local authorization-code demo loop
 * (see README). Idempotent: reuses an existing `demo-cli` client, but the
 * secret is only shown on creation; `pnpm ory:reset` to mint a fresh one.
 */
import { Configuration, OAuth2Api } from "@ory/client-fetch";

const CLIENT_NAME = "demo-cli";
/** The local platform API. Override when seeding against another resource. */
const API_AUDIENCE = process.env.API_AUDIENCE ?? "http://localhost:3100";

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
    return;
  }

  const client = await hydraAdmin.createOAuth2Client({
    oAuth2Client: {
      client_name: CLIENT_NAME,
      // The APIs this client may get a token for. Hydra drops a requested
      // audience that is not here, so an unlisted API yields an empty `aud`
      // and a resource server that refuses the token.
      audience: [API_AUDIENCE],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid offline_access email",
      redirect_uris: ["http://127.0.0.1:5555/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    },
  });
  console.log(`client_id:     ${client.client_id}`);
  console.log(`client_secret: ${client.client_secret}`);
}

await main();
