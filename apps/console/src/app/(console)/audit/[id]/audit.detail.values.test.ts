import { describe, expect, it } from "vitest";
import { redactSecrets, titleCase } from "./audit.detail.values";

describe("redactSecrets", () => {
  it("redacts a matching key at any depth, including inside arrays", () => {
    expect(
      redactSecrets({
        client: { client_secret: "abc", name: "CBM" },
        grants: [{ access_token: "xyz" }, { scope: "openid" }],
      })
    ).toEqual({
      client: { client_secret: "[redacted]", name: "CBM" },
      grants: [{ access_token: "[redacted]" }, { scope: "openid" }],
    });
  });

  it("matches on the key, not the value, and ignores case", () => {
    expect(redactSecrets({ TotpUrl: "otpauth://x", note: "totp" })).toEqual({
      TotpUrl: "[redacted]",
      // The value says totp; only keys are matched, so this is not a leak
      // being missed but a key that names nothing secret.
      note: "totp",
    });
  });

  it("leaves primitives and nulls alone", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets({ count: 3, ok: false })).toEqual({
      count: 3,
      ok: false,
    });
  });
});

describe("titleCase", () => {
  it("reads a snake_case key as words", () => {
    expect(titleCase("client_secret")).toBe("Client secret");
  });
});
