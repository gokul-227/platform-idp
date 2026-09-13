import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./user-agent";

describe("parseUserAgent", () => {
  it("reports nothing rather than guessing for an absent agent", () => {
    expect(parseUserAgent(null)).toEqual({
      browser: null,
      deviceType: null,
      os: null,
    });
  });

  it("reads iOS before macOS, which its platform token also matches", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    expect(parsed.os).toBe("iOS");
    expect(parsed.deviceType).toBe("mobile");
  });

  it("reads Edge before Chrome, whose token it also carries", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
      )
    ).toEqual({ browser: "Edge", deviceType: "desktop", os: "Windows" });
  });

  it("leaves the browser unnamed when nothing matches", () => {
    expect(parseUserAgent("curl/8.4.0").browser).toBeNull();
  });
});
