import { describe, expect, it, vi } from "vitest";
import { resolveIdClientOptions } from "../src/oidc.options";

describe("resolveIdClientOptions", () => {
  it("builds every URL on appUrl, so nothing depends on the request host", () => {
    const resolved = resolveIdClientOptions({ appUrl: "https://app.test" });
    expect(resolved.callbackUrl).toBe("https://app.test/auth/callback");
    expect(resolved.loginUrl).toBe("https://app.test/auth/login");
    expect(resolved.postLogoutRedirect).toBe("https://app.test/auth/login");
  });

  it("strips a trailing slash rather than producing a double one", () => {
    const resolved = resolveIdClientOptions({
      appUrl: "https://app.test/",
      issuer: "https://oauth.test/",
    });
    expect(resolved.callbackUrl).toBe("https://app.test/auth/callback");
    expect(resolved.issuer).toBe("https://oauth.test");
  });

  it("infers secure cookies from the scheme", () => {
    // A Secure cookie over http is dropped silently, and the symptom is a login
    // that appears to work and then forgets you.
    expect(
      resolveIdClientOptions({ appUrl: "http://localhost:3202" }).secureCookies
    ).toBe(false);
    expect(
      resolveIdClientOptions({ appUrl: "https://app.test" }).secureCookies
    ).toBe(true);
  });

  it("lets an explicit secureCookies override the inference", () => {
    expect(
      resolveIdClientOptions({
        appUrl: "http://app.test",
        secureCookies: true,
      }).secureCookies
    ).toBe(true);
  });

  it("treats an empty environment value as missing", () => {
    // `||` not `??`: an empty base makes every URL construction throw.
    process.env.APP_URL = "";
    expect(resolveIdClientOptions({}).appUrl).toBe("http://localhost:3202");
    delete process.env.APP_URL;
  });

  it('survives the literal string "undefined"', () => {
    // What a shell produces from an unset variable. Left to `new URL` it throws,
    // and every request in the app 500s naming neither the variable nor the app.
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {
      // Silence the deliberate diagnostic.
    });
    process.env.APP_URL = "undefined";
    expect(resolveIdClientOptions({}).appUrl).toBe("http://localhost:3202");
    expect(warned).toHaveBeenCalled();
    delete process.env.APP_URL;
  });

  it("requests offline_access by default, which is what yields a refresh token", () => {
    expect(resolveIdClientOptions({}).scopes).toContain("offline_access");
  });

  it("does not read the client secret while resolving", () => {
    // The factory runs at import time; a build machine must not need the secret.
    let reads = 0;
    const resolved = resolveIdClientOptions({
      getClientSecret: () => {
        reads += 1;
        return "s3cret";
      },
    });
    expect(reads).toBe(0);
    expect(resolved.getClientSecret()).toBe("s3cret");
  });
});
