import { NextResponse } from "next/server";
import { oidcEnv, publicOrigin } from "@/lib/oidc-config";
import { clearSession } from "@/lib/session";

/** Clears THIS app's own session only — same documented, honest scope note
 * as every other app in this platform's roster: this does not force a
 * global Ory/Kratos logout, matching standard OIDC RP behavior. */
export async function GET(): Promise<NextResponse> {
  await clearSession();
  return NextResponse.redirect(new URL("/", publicOrigin(oidcEnv())));
}
