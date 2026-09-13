import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { TokenEndpointResponse } from "openid-client";

import { COOKIE, cookieName } from "./oidc.cookies";
import { writeTokens } from "./oidc.handlers";
import type { ResolvedIdClientOptions } from "./oidc.options";
import { isSpent, readSession, refreshOnce } from "./oidc.session";

/**
 * The relay: the browser calls this app, this app calls the platform API with the
 * token attached, so it never reaches client JavaScript (the browser-app BCP).
 * Here rather than in each app because it must renew a stale session exactly as
 * the guard does, which is the half a reimplementation leaves out.
 */

/**
 * Headers describing *this* hop, which must not reach the next. Forwarded `host`
 * names this app, so the API refuses it or a proxy routing on it sends the
 * request back here; a stale `content-length` truncates the body.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Methods a relay serves. `HEAD` and `OPTIONS` are Next's to answer. */
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type ForwardMethod = (typeof METHODS)[number];

const API_PREFIX = /^\/api(?=\/|$)/;

export type ForwardHandlers = Readonly<
  Record<ForwardMethod, (request: NextRequest) => Promise<NextResponse>>
>;

/**
 * `/api` is this app's own prefix, kept so browser calls stay same-origin, and
 * stripped here because the API serves its routes at the root. Forwarding it
 * intact answers 404 on a route that plainly exists. One strip only: nothing
 * else in the path removes it.
 */
function upstreamUrl(request: NextRequest, apiUrl: string): URL {
  // Empty, not "/": replacing with a slash yields "//me", which `new URL`
  // reads as protocol-relative and resolves to the host "me".
  const path = request.nextUrl.pathname.replace(API_PREFIX, "") || "/";
  const url = new URL(path, apiUrl);
  url.search = request.nextUrl.search;
  return url;
}

function forwardableHeaders(request: NextRequest, token: string): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (
      !(HOP_BY_HOP.has(name.toLowerCase()) || name.toLowerCase() === "cookie")
    ) {
      headers.set(name, value);
    }
  }
  // Set last, so a caller cannot talk to the API as somebody else by sending
  // their own authorization header.
  headers.set("authorization", `Bearer ${token}`);
  return headers;
}

function renew(
  options: ResolvedIdClientOptions,
  request: NextRequest
): Promise<TokenEndpointResponse | null> {
  const refreshToken = request.cookies.get(
    cookieName(options, COOKIE.REFRESH)
  )?.value;
  return refreshToken
    ? refreshOnce(options, refreshToken)
    : Promise.resolve(null);
}

export function createForwardHandlers(
  options: ResolvedIdClientOptions
): ForwardHandlers {
  async function relay(request: NextRequest): Promise<NextResponse> {
    const session = await readSession(options);

    // Renew on a spent token, not just a missing cookie: the cookie's one-minute
    // floor guarantees the two sometimes outlive each other, and keying on the
    // cookie forwards a dead token to a 401 nothing tried to renew.
    const live =
      session && !isSpent(session.expiresAt) ? session.accessToken : undefined;
    const renewed = live ? null : await renew(options, request);
    const accessToken = live ?? renewed?.access_token;
    if (!accessToken) {
      // 401 rather than a redirect: the caller is fetch, not a navigation, and
      // a redirect to the login page would arrive as an opaque HTML body where
      // JSON was expected.
      return NextResponse.json(
        { code: "UNAUTHENTICATED", description: "Sign in and try again." },
        { status: 401 }
      );
    }

    const hasBody = !(request.method === "GET" || request.method === "DELETE");
    let response: Response;
    try {
      response = await fetch(upstreamUrl(request, options.apiUrl), {
        method: request.method,
        headers: forwardableHeaders(request, accessToken),
        ...(hasBody ? { body: request.body, duplex: "half" } : {}),
        redirect: "manual",
      } as RequestInit);
    } catch (error) {
      // The API's address and the reason it refused are ours to log and not the
      // visitor's to read.
      console.error(
        "[@aec-craft/platform-id-client-nextjs] forward failed:",
        error instanceof Error ? error.message : error
      );
      return NextResponse.json(
        {
          code: "UPSTREAM_UNAVAILABLE",
          description: "The service did not answer. Try again shortly.",
        },
        { status: 502 }
      );
    }

    // Streamed rather than buffered: a file download should not be held in this
    // process' memory before the browser sees any of it.
    const headers = new Headers(response.headers);
    for (const name of HOP_BY_HOP) {
      headers.delete(name);
    }
    // `fetch` already decompressed the body, so these describe bytes that no
    // longer exist. Forwarded, the browser tries to inflate plain text and the
    // request hangs rather than failing in a way that names the cause.
    headers.delete("content-encoding");
    headers.delete("content-length");
    const relayed = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    // A renewal is only kept if it travels back on this response. Dropped here
    // it would be re-fetched on every call, spending a refresh token per
    // request against an issuer that may well rotate them.
    if (renewed) {
      writeTokens(relayed, options, renewed);
    }
    return relayed;
  }

  return Object.freeze(
    Object.fromEntries(METHODS.map((method) => [method, relay]))
  ) as ForwardHandlers;
}
