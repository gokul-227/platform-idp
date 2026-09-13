import type { Authority } from "@aec-craft/platform-id-sdk/identity";

export type { Authority } from "@aec-craft/platform-id-sdk/identity";

/**
 * What each authority is called on screen. Here rather than beside the rules
 * because the access panel is a client component, and reaching into `staff.ts`
 * for a label would drag `next/headers` into its bundle.
 */
export const AUTHORITY_LABELS: Record<Authority, string> = {
  admin: "Admin",
  root: "Root",
  staff: "Staff",
};

/**
 * What the absence of an authority is called. A customer holds no internal
 * standing and is not nothing: rendering that as a dash read as an account that
 * could do nothing at all, when it is an ordinary one. The menu already named
 * this rung, and the table now agrees with it.
 */
export const NO_AUTHORITY_LABEL = "User";

export const AUTHORITY_DESCRIPTIONS: Record<Authority, string> = {
  admin:
    "Full access to customer identities and applications. Cannot change who has console access.",
  root: "Everything an admin can do, plus appointing and removing admins. Set in ROOT_EMAILS, so it cannot be changed here.",
  staff: "Reads internal documentation. Opens nothing in the console.",
};
