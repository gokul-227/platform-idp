import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { platformAuth } from "@/lib/platform.auth";

/**
 * The OAuth2 round trip that yields a platform token for the operator already
 * signed in here. Not a sign-in: `staff.guard.ts` authenticated them before any
 * of this is reachable; these obtain a token for somebody authenticated.
 *
 * `logout` drops only this token, not the Kratos session, which is what the
 * sidebar's own sign-out is for.
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
