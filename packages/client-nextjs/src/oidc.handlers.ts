import { type NextRequest, NextResponse } from "next/server";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
  type TokenEndpointResponse,
} from "openid-client";
import {
  COOKIE,
  clearCookies,
  cookieName,
  sessionCookie,
  transientCookie,
} from "./oidc.cookies";
import { getConfiguration, readExpiry } from "./oidc.discovery";
import type { ResolvedIdClientOptions } from "./oidc.options";

const LOG_PREFIX = "[@aec-craft/platform-id-client-nextjs]";
/** Hydra's default refresh lifetime is 720h; the cookie should not expire first. */
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;
const FALLBACK_ACCESS_MAX_AGE = 600;
const MIN_ACCESS_MAX_AGE = 60;

/** A path on this app, or nothing. An absolute URL here is an open redirect. */
function safeReturnTo(raw: string | null): string | null {
  if (!raw?.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  return raw;
}

/**
 * Start the flow. PKCE is not optional: the code is delivered through a browser
 * redirect, and without a verifier a code intercepted there can be redeemed by
 * whoever holds it.
 */
export function createLoginHandler(
  options: ResolvedIdClientOptions
): (request: NextRequest) => Promise<NextResponse> {
  return async function login(request: NextRequest): Promise<NextResponse> {
    const config = await getConfiguration(options);
    const verifier = randomPKCECodeVerifier();
    const state = randomState();

    const authorizationUrl = buildAuthorizationUrl(config, {
      code_challenge: await calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      redirect_uri: options.callbackUrl,
      // `audience`, not RFC 8707 `resource`, which the issuer accepts and ignores:
      // the token then arrives with an empty `aud` and every relayed call 401s
      // while the sign-in looks fine. It must be registered on the client too.
      audience: options.apiUrl,
      scope: options.scopes.join(" "),
      state,
    });

    const response = NextResponse.redirect(authorizationUrl);
    const attributes = transientCookie(options);
    response.cookies.set(
      cookieName(options, COOKIE.PKCE),
      verifier,
      attributes
    );
    response.cookies.set(cookieName(options, COOKIE.STATE), state, attributes);

    const returnTo = safeReturnTo(
      request.nextUrl.searchParams.get("return_to")
    );
    if (returnTo) {
      response.cookies.set(
        cookieName(options, COOKIE.RETURN_TO),
        returnTo,
        attributes
      );
    }
    return response;
  };
}

/** Finish the flow: verify state, redeem the code, store the tokens. */
export function createCallbackHandler(
  options: ResolvedIdClientOptions
): (request: NextRequest) => Promise<NextResponse> {
  return async function callback(request: NextRequest): Promise<NextResponse> {
    // `access_denied` is the ordinary case here: somebody pressed the button that
    // declines. Every other exit redirects to the login URL and starts a fresh
    // authorization, which would loop them back into the screen they refused.
    const issuerError = request.nextUrl.searchParams.get("error");
    if (issuerError) {
      // The app renders this, not the package: a refusal is a product moment
      // and deserves the product's own voice. The reason travels as a query
      // parameter so the page can distinguish "I said no" from "it broke".
      const denied = new URL(options.deniedUrl);
      denied.searchParams.set("error", issuerError);
      const response = NextResponse.redirect(denied);
      clearTransient(response, options);
      return response;
    }

    const verifier = request.cookies.get(
      cookieName(options, COOKIE.PKCE)
    )?.value;
    const expectedState = request.cookies.get(
      cookieName(options, COOKIE.STATE)
    )?.value;
    if (!(verifier && expectedState)) {
      // Both are set together at login, so their absence means this URL was
      // opened without one: a bookmark, a replay, or a cross-site attempt.
      return NextResponse.redirect(new URL(options.loginUrl));
    }

    let tokens: TokenEndpointResponse;
    try {
      const config = await getConfiguration(options);
      // The registered redirect URI as the base, not `request.url`: behind Cloud
      // Run the latter carries the container's bind address, and the exchange
      // must present the same URI the authorization was issued against.
      const callbackUrl = new URL(options.callbackUrl);
      callbackUrl.search = request.nextUrl.search;
      tokens = await authorizationCodeGrant(
        config,
        callbackUrl,
        { expectedState, pkceCodeVerifier: verifier },
        // Repeated at the token endpoint: the audience is settled here, and one
        // sent only at the authorization request is not guaranteed to reach the
        // issued token.
        { audience: options.apiUrl }
      );
    } catch (error) {
      // Never echoed to the visitor: the issuer's message carries hostnames,
      // request ids and grant detail. An expired or replayed code is not an
      // error to explain, it is a flow to start again.
      console.error(
        `${LOG_PREFIX} token exchange failed for ${options.clientId} at ${options.issuer}:`,
        error instanceof Error ? error.message : error
      );
      return NextResponse.redirect(new URL(options.loginUrl));
    }

    const returnTo = safeReturnTo(
      request.cookies.get(cookieName(options, COOKIE.RETURN_TO))?.value ?? null
    );
    const response = NextResponse.redirect(
      new URL(returnTo ?? options.postLoginRedirect, options.appUrl)
    );
    writeTokens(response, options, tokens);

    // One shot each. Reloading the callback must fail rather than quietly
    // attempt an authorization code the issuer has already consumed.
    clearTransient(response, options);
    return response;
  };
}

/**
 * Sign out. Clears this app's cookies and, when the issuer published an
 * end-session endpoint, hands off to it so the session at the issuer ends too.
 * Without that second half, "sign out" only forgets locally and the next login
 * completes silently, which reads as the button having done nothing.
 */
export function createLogoutHandler(
  options: ResolvedIdClientOptions
): (request: NextRequest) => Promise<NextResponse> {
  return async function logout(request: NextRequest): Promise<NextResponse> {
    const local = new URL(options.postLogoutRedirect, options.appUrl);
    let target = local;
    const idToken = request.cookies.get(cookieName(options, COOKIE.ID))?.value;
    try {
      const config = await getConfiguration(options);
      const endSession = config.serverMetadata().end_session_endpoint;
      // Both or neither. Hydra rejects `post_logout_redirect_uri` without
      // `id_token_hint` outright, so a hint we do not have means the hand-off
      // has to be skipped rather than attempted: ending the session at the
      // issuer is worth less than a sign-out that lands somewhere.
      if (endSession && idToken) {
        const url = new URL(endSession);
        url.searchParams.set("id_token_hint", idToken);
        url.searchParams.set("post_logout_redirect_uri", local.toString());
        target = url;
      }
    } catch {
      // Discovery is down. Clearing our own cookies is still correct and still
      // the more important half.
    }
    const response = NextResponse.redirect(target);
    clearCookies(response, options);
    return response;
  };
}

/** Shared by the callback and the gate's silent renewal. */
export function writeTokens(
  response: NextResponse,
  options: ResolvedIdClientOptions,
  tokens: TokenEndpointResponse
): void {
  const expiry = readExpiry(tokens.access_token);
  const maxAge =
    tokens.expires_in ??
    (expiry
      ? Math.max(MIN_ACCESS_MAX_AGE, expiry - Math.floor(Date.now() / 1000))
      : FALLBACK_ACCESS_MAX_AGE);
  response.cookies.set(
    cookieName(options, COOKIE.ACCESS),
    tokens.access_token,
    sessionCookie(options, maxAge)
  );
  if (tokens.refresh_token) {
    response.cookies.set(
      cookieName(options, COOKIE.REFRESH),
      tokens.refresh_token,
      sessionCookie(options, REFRESH_MAX_AGE)
    );
  }
  // Only for `id_token_hint` at logout. A refresh may not return one, so the
  // stored value is left in place rather than cleared when it is absent.
  if (tokens.id_token) {
    response.cookies.set(
      cookieName(options, COOKIE.ID),
      tokens.id_token,
      sessionCookie(options, REFRESH_MAX_AGE)
    );
  }
}

function clearTransient(
  response: NextResponse,
  options: ResolvedIdClientOptions
): void {
  response.cookies.delete(cookieName(options, COOKIE.PKCE));
  response.cookies.delete(cookieName(options, COOKIE.STATE));
  response.cookies.delete(cookieName(options, COOKIE.RETURN_TO));
}
