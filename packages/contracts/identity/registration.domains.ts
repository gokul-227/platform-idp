/**
 * Who may create an account for themselves. A policy about self-service, not
 * about what an identity may be, which is why it is not a schema pattern: that
 * binds every flow validating traits, the admin API included.
 *
 * Two settings, because open and bounded-to-these-domains are separate decisions:
 * `REGISTRATION_OPEN=true` ignores the list, `REGISTRATION_ALLOWED_DOMAINS` is
 * the list otherwise. No list here on purpose; it lives per environment.
 */
import { domainOf } from "./email";

export type RegistrationPolicy =
  | { open: true }
  | { open: false; domains: readonly string[] };

/**
 * Reads the two settings into one decision. Anything but a literal `true` leaves
 * it closed: `1`, `yes` or an empty string is likelier a mistake than a decision
 * to open registration to the internet.
 */
export function registrationPolicy(
  isOpen: string | undefined,
  configured: string | undefined
): RegistrationPolicy {
  if (isOpen?.trim().toLowerCase() === "true") {
    return { open: true };
  }
  const domains = (configured ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return { open: false, domains };
}

/**
 * Whether this address may register itself. A closed policy with no domains
 * admits nobody, because the other reading turns a missing variable into open
 * registration, which is the failure nobody notices. Domains are compared whole:
 * a suffix test admits `notneobim.ai` and `neobim.ai.attacker.test`.
 */
export function mayRegister(
  email: string,
  policy: RegistrationPolicy
): boolean {
  if (policy.open) {
    return true;
  }
  const domain = domainOf(email);
  if (!domain) {
    return false;
  }
  return policy.domains.some((entry) => entry === domain);
}
