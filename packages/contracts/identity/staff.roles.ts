/**
 * One role. `admin` is the whole of it: everything the console and the staff
 * surface allow. The role lives in `metadata_public.staffRole`, which only the
 * admin API can write, and is read off the session so a change lands without a
 * re-login. An unrecognised value grants nothing: the gate fails closed.
 *
 * Deciding *who may hold it* is not a second role. That is a root, and a root is
 * configuration rather than a row, so it cannot be revoked by anything that can
 * reach the data. `superadmin` was the role that used to do it.
 */

export const STAFF_ROLES = ["admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin:
    "Full access to customer identities and applications. Cannot change who has console access.",
};
