/**
 * Reading one event's bags for display: what a key is called, what a value
 * says, and what must never be shown. Separate from the cards because these are
 * where the judgement is, and `redactSecrets` in particular is worth testing on
 * its own.
 */

/** The keys a card above already shows, so the catch-all list below does not
 *  say them twice. */
export const NAMED_CONTEXT_KEYS = new Set(["authMethod", "reason"]);
export const NAMED_PAYLOAD_KEYS = new Set([
  "after",
  "before",
  "changes",
  "credentialType",
]);

/**
 * A defensive denylist, matched as substrings so one entry catches
 * "clientSecret", "totpSecret" and "recoveryCode". Load-bearing rather than
 * belt-and-braces: `parseAuditIntake` checks an event's resource, verb and
 * status against the vocabulary and passes `context` and `payload` through as
 * arbitrary objects, so this page renders bags Kratos and the edge guard wrote
 * and this repo never typed.
 */
export const SECRET_KEY_PATTERN =
  /secret|token|password|credential|recoverycode|totp/i;

export function titleCase(key: string): string {
  const spaced = key
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const CHANGED_FIELD_LABEL: Record<string, string> = {
  audience: "Audience",
  grantTypes: "Grant types",
  name: "Name",
  postLogoutRedirectUris: "Sign-out redirect URIs",
  redirectUris: "Redirect URIs",
  scope: "Scope",
  skipConsent: "Consent setting",
};

export function fieldChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.join(", ");
  }
  return typeof value === "boolean" ? String(value) : JSON.stringify(value);
}

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export function isFieldChange(value: unknown): value is FieldChange {
  return (
    typeof value === "object" &&
    value !== null &&
    "field" in value &&
    "from" in value &&
    "to" in value
  );
}

/** Strips secret-matching keys before the raw event is dumped: this card shows
 *  the whole context and payload bags, not a curated subset. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(val),
      ])
    );
  }
  return value;
}
