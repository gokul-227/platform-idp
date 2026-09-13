import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { platformAuth } from "@/lib/platform.auth";

/**
 * The OAuth2 round trip that yields a platform access token for the person
 * already signed in here. Not the sign-in screen: `/login` is Kratos's flow and
 * authenticates somebody; these obtain a token for somebody authenticated.
 *
 * `login` carries `return_to` so the visitor lands back where they were.
 * `callback` must match the client's registered `redirect_uris` entry exactly.
 * `logout` drops only this token, deliberately not the Kratos session — ending
 * the identity session already makes the token unrenewable.
 *
 * One segment rather than three route files, because all three are the same
 * handler set from one client and the paths are fixed by that registration.
 */
const HANDLERS = platformAuth.handlers;

export function GET(
  request: NextRequest,
  context: { params: Promise<{ action: string }> }
): Promise<Response> {
  return context.params.then(({ action }) => {
    const handler = HANDLERS[action as keyof typeof HANDLERS];
    if (typeof handler !== "function") {
      notFound();
    }
    return handler(request);
  });
}
