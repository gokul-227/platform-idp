/**
 * Why a staff guard refused. Diagnostic only, and it never reaches the browser:
 * several of these describe how access is granted. The first three are resolvable
 * by an auth flow and never reach the denied page.
 */
export type StaffGuardDenialReason =
  | "no-session"
  | "session-invalid"
  | "aal-step-up-required"
  | "no-role"
  | "not-staff"
  | "session-unavailable"
  | "unknown-role";

/**
 * What the visitor is told: `no-access` (nothing, without a grant) and
 * `unavailable` (our fault, retry). Two, because that is how many distinct things
 * they can do about it, and telling the three no-access reasons apart in public
 * hands an attacker a map while all three end at the same door.
 *
 * A missing second factor is absent: the guard sends that session to step-up,
 * which is not a dead end. Wire values, so append-only.
 */
export type GuardRefusalCode = "no-access" | "unavailable";

/**
 * The reason a visitor is shown, or null when the reason is resolved by a flow
 * and therefore never lands on the denied page.
 */
export function refusalCodeFor(
  reason: StaffGuardDenialReason
): GuardRefusalCode | null {
  switch (reason) {
    case "not-staff":
    case "no-role":
    case "unknown-role":
      return "no-access";
    case "session-unavailable":
      return "unavailable";
    default:
      return null;
  }
}
