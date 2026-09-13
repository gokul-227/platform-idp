import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionGuard } from "../src/oidc.guard";
import { resolveIdClientOptions } from "../src/oidc.options";

const APP = "http://app.test";
const options = resolveIdClientOptions({ appUrl: APP });

function request(path = "/reports?page=2", cookie?: string): NextRequest {
  const headers = cookie ? { cookie } : undefined;
  return new NextRequest(`${APP}${path}`, headers ? { headers } : undefined);
}

/**
 * A token the gate will read as live. It has to carry a real `exp`: the gate
 * asks whether the token is spent, not whether a cookie exists, and one with no
 * readable expiry counts as spent.
 */
function accessToken(expiresInSeconds: number, aal?: string): string {
  const claims = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      ...(aal ? { ext: { aal } } : {}),
    })
  ).toString("base64url");
  return `header.${claims}.signature`;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the OAuth client gate", () => {
  it("lets a request with a live access token through untouched", async () => {
    const response = await createSessionGuard(options)(
      request("/", `buildos_at=${accessToken(600)}`)
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not send a spent access token on, even though its cookie is there", async () => {
    // The failure this prevents is the quiet one: a present cookie is no
    // evidence the token inside is alive, and forwarding it 401s at the API
    // with nothing having tried to renew.
    const response = await createSessionGuard(options)(
      request("/", `buildos_at=${accessToken(5)}`)
    );
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("sends a request with no tokens to login, carrying return_to", async () => {
    const response = await createSessionGuard(options)(request());
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(`${APP}/auth/login`);
    expect(location.searchParams.get("return_to")).toBe("/reports?page=2");
  });

  it("omits return_to for the root, which is where login lands anyway", async () => {
    const response = await createSessionGuard(options)(request("/"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.has("return_to")).toBe(false);
  });

  it("falls back to login when the refresh token is refused", async () => {
    // Expired, revoked or replayed: not recoverable, so the visitor signs in.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("invalid_grant")))
    );
    const response = await createSessionGuard(options)(
      request("/reports", "buildos_rt=stale")
    );
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("never sends the refresh token itself to the browser", async () => {
    const response = await createSessionGuard(options)(
      request("/", "buildos_rt=stale")
    );
    expect(response.headers.get("location") ?? "").not.toContain("stale");
  });

  describe("with a required assurance level", () => {
    const strict = resolveIdClientOptions({ appUrl: APP, requiredAal: "aal2" });

    it("serves a live token that states the level, or a higher one", async () => {
      for (const aal of ["aal2", "aal3"]) {
        const response = await createSessionGuard(strict)(
          request("/", `buildos_at=${accessToken(600, aal)}`)
        );
        expect(response.headers.get("x-middleware-next")).toBe("1");
      }
    });

    // The token is alive and would pass the spent check; what it says about the
    // session is what the resource server will refuse, so it is re-authorized
    // rather than forwarded.
    it("sends a live token minted below the level back through login", async () => {
      for (const token of [accessToken(600, "aal1"), accessToken(600)]) {
        const response = await createSessionGuard(strict)(
          request("/reports", `buildos_at=${token}`)
        );
        expect(response.headers.get("x-middleware-next")).toBeNull();
        expect(response.headers.get("location")).toContain("/auth/login");
      }
    });

    it("does not renew its way to a level a refresh cannot raise", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: accessToken(600, "aal1"),
                token_type: "bearer",
                expires_in: 600,
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        )
      );
      const response = await createSessionGuard(strict)(
        request(
          "/",
          `buildos_at=${accessToken(5, "aal1")}; buildos_rt=refresh-1`
        )
      );
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(response.headers.get("location")).toContain("/auth/login");
    });
  });
});
