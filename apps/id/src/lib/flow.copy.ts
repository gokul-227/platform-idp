import type { UiText } from "@ory/client-fetch";

/**
 * Replace Kratos's own wording where ours is clearer.
 *
 * Kratos OSS has no mechanism for overriding message text, and we render
 * `ui.messages` ourselves, so this is the only seam. Keyed on the message's
 * `context` rather than its id or its text: the context is structured data
 * Kratos documents as the customization hook, so a reworded upstream string or
 * a renumbered id does not silently disable the rewrite.
 */

interface LinkingContext {
  available_credential_types?: string[];
  available_oidc_providers?: string[];
}

interface PatternContext {
  pattern?: string;
}

/** How a person would name each first-factor method. */
const METHOD_LABELS: Record<string, string> = {
  code: "an emailed code",
  password: "your password",
  passkey: "your passkey",
  webauthn: "your security key",
};

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) {
    return phrases[0] ?? "";
  }
  return `${phrases.slice(0, -1).join(", ")} or ${phrases.at(-1)}`;
}

/**
 * The account-linking notice. Kratos explains it as a failure ("that email is
 * already used by another account"), when what is actually on offer is adding a
 * second way into the account someone already has. The context lists the ways
 * they can sign in today, which is the one thing they need to be told.
 */
function linkingText(context: LinkingContext): string | null {
  const methods = (context.available_credential_types ?? [])
    .map((type) => METHOD_LABELS[type])
    .filter((label): label is string => Boolean(label));
  const providers = (context.available_oidc_providers ?? []).map(providerLabel);
  const options = [...methods, ...providers];
  if (options.length === 0) {
    return null;
  }
  return `You already have an account with this email. Sign in with ${joinPhrases(options)}, and this new way of signing in is added to it.`;
}

/**
 * The domain gate on the email trait. Kratos reports a schema `pattern`
 * violation by printing the regex, which spells the allowlist out; this says
 * no without naming which addresses would have been accepted.
 */
const PATTERN_TEXT = "Registration is closed for this email address.";

/** The text to render for a message, ours where we have better. */
export function messageText(message: UiText): string {
  const context = (message.context ?? {}) as LinkingContext & PatternContext;
  if (context.available_credential_types || context.available_oidc_providers) {
    return linkingText(context) ?? message.text;
  }
  if (context.pattern) {
    return PATTERN_TEXT;
  }
  return message.text;
}
