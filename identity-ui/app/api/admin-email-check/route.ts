// Trivial, side-effect-free lookup for components/login-flow.tsx's
// client-side "Continue" step: given a typed email, say whether it should
// get the admin-emphasis login layout (email-code + Google/Microsoft
// foregrounded) or the normal one (passkey + Google/Microsoft, password
// de-emphasized). This is a UI EMPHASIS decision only — it doesn't touch
// Kratos, doesn't create/read any session, and never grants or restricts
// actual authentication; Kratos itself is the sole source of truth for who
// can really sign in. Needed as a route handler (not a plain server
// function) because login-flow.tsx's reveal step is client-side
// progressive disclosure over an already-fetched flow, not a page
// server-render.

import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin-emails";

export async function POST(request: Request): Promise<NextResponse<{ isAdmin: boolean }>> {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  return NextResponse.json({ isAdmin: isAdminEmail(email) });
}
