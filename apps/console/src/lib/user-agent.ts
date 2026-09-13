/**
 * A dependency-free read of the agent strings a session or an audit row carries.
 * Both surfaces show the same three fields, so neither parses its own.
 */

/**
 * A dependency-free parse of the few agents an audit row realistically carries,
 * not a UA database. Null rather than guessed: a wrong-but-confident label is
 * worse than none on a security page.
 */
export interface ParsedUserAgent {
  browser: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | null;
  os: string | null;
}

const BROWSER_PATTERNS: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Chrome\//, "Chrome"],
  [/CriOS\//, "Chrome"],
  [/FxiOS\//, "Firefox"],
  [/Firefox\//, "Firefox"],
  [/Version\/.*Safari\//, "Safari"],
];

const TABLET_PATTERN = /iPad|Tablet/;
const MOBILE_PATTERN = /Mobi|iPhone|Android/;

const OS_PATTERNS: readonly [RegExp, string][] = [
  [/Windows NT/, "Windows"],
  // Checked before macOS: an iOS user agent's platform token reads
  // "like Mac OS X" for compatibility, so it also matches that pattern.
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X/, "macOS"],
  [/Android/, "Android"],
  [/Linux/, "Linux"],
];

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) {
    return { browser: null, deviceType: null, os: null };
  }
  const browser =
    BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const os =
    OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const deviceType = TABLET_PATTERN.test(userAgent)
    ? "tablet"
    : MOBILE_PATTERN.test(userAgent)
      ? "mobile"
      : "desktop";
  return { browser, deviceType, os };
}
