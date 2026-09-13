import { env } from "./env";

/**
 * Validate a `return_to` before rendering it as a link: the value is
 * attacker-controlled, and Kratos's own `allowed_return_urls` check covers its
 * redirects, not a link this app draws. Accepted are a path here or an origin in
 * `ALLOWED_RETURN_ORIGINS`; anything else is null and the caller shows nothing.
 */
export function safeReturnTo(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  // A path, not a protocol-relative URL: "//evil.example" is a host.
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  return env.allowedReturnOrigins.includes(url.origin) ? url.toString() : null;
}
