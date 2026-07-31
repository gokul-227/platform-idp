// A small, dependency-free real-user-agent parser for session/device
// display — deliberately not a full UA-sniffing library (no new
// dependency introduced for what's cosmetic display only, never used for
// a security decision). Covers the browsers/OSes real traffic to this
// platform actually presents (confirmed live: Chromium via Playwright
// during verification, httpx/curl during automated testing).

export interface ParsedUserAgent {
  browser: string;
  deviceType: "desktop" | "mobile" | "unknown";
  os: string;
}

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Chrome\//, "Chrome"],
  [/CriOS\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/FxiOS\//, "Firefox"],
  [/Version\/.*Safari\//, "Safari"],
  [/python-httpx/, "API client"],
  [/curl\//, "API client"],
  [/PostmanRuntime/, "API client"],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/Windows NT/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Android/, "Android"],
  [/iPhone|iPad|iOS/, "iOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function parseUserAgent(userAgent: string | undefined | null): ParsedUserAgent {
  const ua = userAgent ?? "";
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Unknown browser";
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Unknown OS";
  const deviceType: ParsedUserAgent["deviceType"] = /Mobi|Android|iPhone/.test(ua)
    ? "mobile"
    : browser === "API client"
      ? "unknown"
      : "desktop";
  return { browser, deviceType, os };
}
