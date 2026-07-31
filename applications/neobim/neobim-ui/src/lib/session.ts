import { cookies } from "next/headers";

const SESSION_COOKIE = "neobim_session";

export type NeobimSession = {
  sub: string;
  email: string | null;
  name: string | null;
};

/** Minimal demo session store: the ID token's claims, base64-encoded into an
 * httpOnly cookie. Good enough to prove the OIDC round-trip; a real
 * deployment would verify+store the ID token itself (or a server-side
 * session keyed by a random id) rather than trusting an unsigned cookie. */
export async function setSession(session: NeobimSession): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, Buffer.from(JSON.stringify(session)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
}

export async function getSession(): Promise<NeobimSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
