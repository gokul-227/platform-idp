import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { createIdClient } from "../src";
import { COOKIE } from "../src/oidc.cookies";

const APP = "http://app.test";

function token(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("the session off a request", () => {
  it("reads the subject and the nested claims the same way getSession does", () => {
    const client = createIdClient({ appUrl: APP });
    const at = token({
      sub: "s-1",
      exp: 4_000_000_000,
      ext: { aal: "aal2", staffRole: "admin" },
    });
    const session = client.sessionOf(
      new NextRequest(`${APP}/x`, { headers: { cookie: `buildos_at=${at}` } })
    );
    expect(session?.subject).toBe("s-1");
    expect(session?.aal).toBe("aal2");
    expect(session?.staffRole).toBe("admin");
  });

  it("is null without the cookie", () => {
    const client = createIdClient({ appUrl: APP });
    expect(client.sessionOf(new NextRequest(`${APP}/x`))).toBeNull();
  });

  it("clears every cookie it owns on the response it is given", () => {
    const client = createIdClient({ appUrl: APP });
    const response = NextResponse.redirect(`${APP}/bye`);
    client.clearSession(response);
    const cleared = response.cookies
      .getAll()
      .map((cookie) => cookie.name)
      .sort();
    expect(cleared).toEqual(
      Object.values(COOKIE)
        .map((suffix) => `buildos_${suffix}`)
        .sort()
    );
    for (const cookie of response.cookies.getAll()) {
      expect(cookie.value).toBe("");
    }
  });
});
