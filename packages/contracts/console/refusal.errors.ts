import type { PlatformErrorSpec } from "../common/platform-error";

/**
 * The rules protecting console access, as the refusals they produce. A refusal is
 * not a failure: the code lets an action that returns no value report which rule
 * stopped it without free text in a URL. Lowercase and hyphenated because they
 * are already on the wire as a redirect parameter. No `status`: no HTTP surface
 * answers with these.
 */
export const RefusalErrors = {
  "email-taken": {
    code: "email-taken",
    name: "Email already used",
    description: "An identity with that email already exists.",
  },
  "needs-root": {
    code: "needs-root",
    name: "Root required",
    description: "Only a root can change console access.",
  },
  "not-signed-in": {
    code: "not-signed-in",
    name: "Not signed in",
    description: "Not signed in as staff.",
  },
  "profile-not-removed": {
    code: "profile-not-removed",
    name: "Profile not removed",
    description:
      "The platform did not confirm that it removed this person's profile, so the identity was left in place. Try again.",
  },
  "rejected-traits": {
    code: "rejected-traits",
    name: "Details refused",
    description:
      "The identity schema refused these details. Its email pattern admits only addresses on a domain this platform owns; see docs/identities.md.",
  },
  root: {
    code: "root",
    name: "Root account",
    description:
      "A root is configured rather than granted, so it cannot be changed from the console.",
  },
  self: {
    code: "self",
    name: "Own account",
    description: "You cannot do this to your own account.",
  },
  "sole-owner": {
    code: "sole-owner",
    name: "Sole owner",
    description:
      "The platform refuses to remove this person's profile while they are the only owner of an organization or project. Hand those over first.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;

export type RefusalCode = keyof typeof RefusalErrors;

/** A refusal code arrives from a URL, so it is a claim until this says otherwise. */
export function isRefusalCode(value: unknown): value is RefusalCode {
  return typeof value === "string" && Object.hasOwn(RefusalErrors, value);
}
