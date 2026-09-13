/**
 * Reading an address against a configured list. Two lists are held this way and
 * they answer different questions: which domains are ours, and which addresses
 * administer everything. Both are configuration rather than stored data, so a
 * value here survives anything done to an identity.
 */

/** The domain half of an address, lowercased. Null when there isn't one. */
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) {
    return null;
  }
  return email.slice(at + 1).toLowerCase();
}

/**
 * A comma-separated environment value as a list. Empty entries are dropped, so a
 * trailing comma or an unset variable yields nothing rather than a list
 * containing the empty string, which would match an address with no domain.
 */
export function commaList(configured: string | undefined): string[] {
  return (configured ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether this is one of these addresses, compared whole and case-insensitively. */
export function hasAddress(
  email: string,
  addresses: readonly string[]
): boolean {
  const normalised = email.trim().toLowerCase();
  return normalised.length > 0 && addresses.includes(normalised);
}
