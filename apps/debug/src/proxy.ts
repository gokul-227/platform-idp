import { auth } from "@/lib/auth";

/**
 * The whole consumer-facing surface of the OAuth client. Next 16 names this file
 * `src/proxy.ts` with a `proxy` export; on 15 and earlier it is
 * `src/middleware.ts` exporting `middleware`.
 *
 * The gate renews from the refresh token as well as checking a cookie, because
 * Hydra's access token lasts ten minutes. The console is the one surface that
 * does not work this way: it reads a Kratos session cookie directly.
 */
export const proxy = auth.guard;

/**
 * `/auth/*` must sit outside the gate: it is the flow that obtains a session,
 * so gating it is a redirect loop by construction.
 *
 * The literal cannot be built from a variable. Next parses this statically at
 * build time and never evaluates the module.
 */
export const config = {
  matcher: ["/((?!auth|_next/static|_next/image|favicon.ico).*)"],
};
