import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIdClient } from "../src/index";

/**
 * What the unit tests cannot reach: the flow against a real issuer. They run with
 * no network, so a package where discovery, the code exchange, the gate's renewal
 * and reading claims from under `ext` all failed would still pass them. The issuer
 * here is an HTTP server, so `openid-client` is exercised rather than mocked.
 */

const APP = "http://app.test";
const CLIENT_ID = "probe-client";
const CLIENT_SECRET = "probe-secret";

let issuer: Server;
let issuerUrl: string;
let idToken: string;
let refreshCount = 0;

async function accessToken(
  claims: Record<string, unknown>,
  key: Parameters<SignJWT["sign"]>[0]
): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(issuerUrl)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" };

  issuer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", issuerUrl);
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    if (url.pathname === "/.well-known/openid-configuration") {
      json({
        authorization_endpoint: `${issuerUrl}/oauth2/auth`,
        code_challenge_methods_supported: ["S256"],
        end_session_endpoint: `${issuerUrl}/oauth2/sessions/logout`,
        grant_types_supported: ["authorization_code", "refresh_token"],
        id_token_signing_alg_values_supported: ["RS256"],
        issuer: issuerUrl,
        jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        token_endpoint: `${issuerUrl}/oauth2/token`,
      });
      return;
    }
    if (url.pathname === "/.well-known/jwks.json") {
      json({ keys: [jwk] });
      return;
    }
    if (url.pathname === "/oauth2/token") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const form = new URLSearchParams(body);
        const grant = form.get("grant_type");
        if (grant === "refresh_token") {
          refreshCount += 1;
        }
        // Hydra nests whatever consent granted under `ext`. Reproducing that
        // shape is the point: a flat token would let a broken reader pass.
        const claims = {
          client_id: CLIENT_ID,
          ext: { aal: "aal2", email: "a@b.test", staffRole: "admin" },
          sub: "u1",
        };
        accessToken(claims, privateKey).then((token) =>
          json({
            access_token: token,
            expires_in: 600,
            id_token: idToken,
            refresh_token: `r-${grant}`,
            token_type: "bearer",
          })
        );
      });
      return;
    }
    json({ error: "not_found" }, 404);
  });

  await new Promise<void>((resolve) => {
    issuer.listen(0, "127.0.0.1", resolve);
  });
  const address = issuer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  issuerUrl = `http://127.0.0.1:${port}`;

  // `iat` is not optional: openid-client validates the id token and rejects the
  // whole response without it, reporting only "invalid response encountered".
  idToken = await new SignJWT({ sub: "u1" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(issuerUrl)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    issuer.close(() => resolve());
  });
});

function client() {
  return createIdClient({
    appUrl: APP,
    clientId: CLIENT_ID,
    getClientSecret: () => CLIENT_SECRET,
    issuer: issuerUrl,
  });
}

/** Cookie values a Set-Cookie list carries, by name. */
function cookiesOf(response: {
  cookies: { getAll: () => { name: string; value: string }[] };
}): Map<string, string> {
  return new Map(response.cookies.getAll().map((c) => [c.name, c.value]));
}

describe("the flow against a real issuer", () => {
  it("discovers the issuer and builds an authorize URL with PKCE", async () => {
    const response = await client().handlers.login(
      new NextRequest(`${APP}/auth/login?return_to=%2Freports`)
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      `${issuerUrl}/oauth2/auth`
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(
      `${APP}/auth/callback`
    );

    const jar = cookiesOf(response);
    expect(jar.get("buildos_pkce")).toBeTruthy();
    expect(jar.get("buildos_state")).toBe(
      location.searchParams.get("state") ?? ""
    );
    expect(jar.get("buildos_rto")).toBe("/reports");
  });

  it("exchanges a code for tokens and lands on return_to", async () => {
    const login = await client().handlers.login(
      new NextRequest(`${APP}/auth/login?return_to=%2Freports`)
    );
    const jar = cookiesOf(login);
    const state = jar.get("buildos_state") ?? "";

    const response = await client().handlers.callback(
      new NextRequest(`${APP}/auth/callback?code=good-code&state=${state}`, {
        headers: {
          cookie: `buildos_pkce=${jar.get("buildos_pkce")}; buildos_state=${state}; buildos_rto=%2Freports`,
        },
      })
    );

    expect(response.headers.get("location")).toBe(`${APP}/reports`);
    const set = cookiesOf(response);
    expect(set.get("buildos_at")).toBeTruthy();
    expect(set.get("buildos_rt")).toBe("r-authorization_code");
    // Stored for `id_token_hint`; without it Hydra refuses the logout request.
    expect(set.get("buildos_it")).toBe(idToken);
  });

  it("refuses a callback whose state was never issued", async () => {
    const response = await client().handlers.callback(
      new NextRequest(`${APP}/auth/callback?code=good-code&state=forged`)
    );
    // No transients means the URL was opened without a login: a bookmark, a
    // replay, or a cross-site attempt. Back to login, never an exchange.
    expect(response.headers.get("location")).toBe(`${APP}/auth/login`);
  });

  it("renews from the refresh token instead of restarting the flow", async () => {
    const before = refreshCount;
    const response = await client().guard(
      new NextRequest(`${APP}/reports`, {
        headers: { cookie: "buildos_rt=stored-refresh" },
      })
    );
    // Through, not redirected: the whole reason the gate is not a cookie check.
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(refreshCount).toBe(before + 1);
    expect(cookiesOf(response).get("buildos_at")).toBeTruthy();
  });

  it("sends logout to the issuer with the id_token_hint it requires", async () => {
    const response = await client().handlers.logout(
      new NextRequest(`${APP}/auth/logout`, {
        headers: { cookie: `buildos_it=${idToken}` },
      })
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      `${issuerUrl}/oauth2/sessions/logout`
    );
    expect(location.searchParams.get("id_token_hint")).toBe(idToken);
    expect(location.searchParams.get("post_logout_redirect_uri")).toBe(
      `${APP}/auth/login`
    );
  });

  it("stays local when no id_token is stored, rather than being refused", async () => {
    const response = await client().handlers.logout(
      new NextRequest(`${APP}/auth/logout`)
    );
    // Both parameters or neither: the issuer rejects the redirect URI without a
    // hint, so a hand-off we cannot complete is skipped rather than attempted.
    expect(response.headers.get("location")).toBe(`${APP}/auth/login`);
  });
});
