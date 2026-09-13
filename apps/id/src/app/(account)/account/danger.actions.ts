"use server";

import { redirect } from "next/navigation";
import { deleteOwnAccount } from "@/lib/account.deletion";
import { getSession } from "@/lib/kratos";

export interface DeleteAccountResult {
  error?: string;
}

/**
 * How recently the visitor proved who they are before this is allowed.
 *
 * The same fifteen minutes Kratos applies to a settings change through
 * `privileged_session_max_age`, for a stronger reason: changing a password on a
 * borrowed laptop is recoverable and this is not. Kratos enforces its own rule
 * on flows it renders, and this is an admin call it never sees, so the rule has
 * to be applied here or it does not apply at all.
 */
const PRIVILEGED_SESSION_MS = 15 * 60 * 1000;

export async function deleteAccount(
  _previous: DeleteAccountResult,
  formData: FormData
): Promise<DeleteAccountResult> {
  const session = await getSession();
  const identityId = session?.identity?.id;
  if (!identityId) {
    return { error: "Sign in again and retry." };
  }

  // Typed rather than clicked. A confirm dialog stops the accident; nothing
  // stops a deliberate click, and this is the one action with nothing behind it.
  const confirmation = String(formData.get("confirm") ?? "").trim();
  const email = (session?.identity?.traits as { email?: string })?.email ?? "";
  if (!email || confirmation.toLowerCase() !== email.toLowerCase()) {
    return { error: "Type your email address exactly to confirm." };
  }

  const authenticatedAt = session?.authenticated_at;
  const isFresh =
    authenticatedAt instanceof Date &&
    Date.now() - authenticatedAt.getTime() < PRIVILEGED_SESSION_MS;
  if (!isFresh) {
    // `refresh=true` asks Kratos for the first factor again on a session that
    // is already valid, which is what makes the returning session fresh.
    redirect("/login?refresh=true&return_to=/account");
  }

  const result = await deleteOwnAccount();
  if (result.type === "sole-owner") {
    const named = result.authorities.map((a) => a.name).join(", ");
    return {
      error: named
        ? `You are the only owner of ${named}. Hand those over first, then come back.`
        : "You are the only owner of an organization or project. Hand those over first, then come back.",
    };
  }
  if (result.type === "failed") {
    return { error: "The account could not be closed. Try again shortly." };
  }

  // The identity is gone, so the session cookie now names nothing. Logout is
  // still the right exit: it clears the cookie and lands on the sign-in page.
  redirect("/logout");
}
