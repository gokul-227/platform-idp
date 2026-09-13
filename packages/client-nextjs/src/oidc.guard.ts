import { type NextRequest, NextResponse } from "next/server";
import { COOKIE, cookieName } from "./oidc.cookies";
import { meetsAal, readAal, readExpiry } from "./oidc.discovery";
import { writeTokens } from "./oidc.handlers";
import type { ResolvedIdClientOptions } from "./oidc.options";
import { isSpent, refreshOnce } from "./oidc.session";

/**
 * The gate: through on a live access token, renew on a refresh token, otherwise
 * the login route carrying `return_to`.
 *
 * Renewal belongs here because this is the only place in a Next app that runs
 * before a page and owns a response to put `Set-Cookie` on. It is not a nicety:
 * the access token lasts ten minutes, so without it a signed-in visitor is walked
 * back through the authorization flow that often.
 */
export function createSessionGuard(
  options: ResolvedIdClientOptions
): (request: NextRequest) => Promise<NextResponse> {
  return async function guard(request: NextRequest): Promise<NextResponse> {
    // Spent, not merely absent: the cookie and the token it carries do not
    // expire together, so a present cookie is no evidence the token inside is
    // alive.
    // Assurance is a property of the authorization, not of the refresh: a
    // chain minted at aal1 stays aal1, so only a new authorization can raise it.
    const assured = (token: string): boolean =>
      options.requiredAal === null ||
      meetsAal(readAal(token), options.requiredAal);

    const access = request.cookies.get(cookieName(options, COOKIE.ACCESS));
    if (access && !isSpent(readExpiry(access.value))) {
      if (assured(access.value)) {
        return NextResponse.next();
      }
    } else {
      const refreshToken = request.cookies.get(
        cookieName(options, COOKIE.REFRESH)
      )?.value;
      if (refreshToken) {
        const tokens = await refreshOnce(options, refreshToken);
        if (tokens && assured(tokens.access_token)) {
          const response = NextResponse.next();
          writeTokens(response, options, tokens);
          return response;
        }
      }
    }

    const login = new URL(options.loginUrl);
    const returnTo = request.nextUrl.pathname + request.nextUrl.search;
    if (returnTo && returnTo !== "/") {
      login.searchParams.set("return_to", returnTo);
    }
    return NextResponse.redirect(login);
  };
}
