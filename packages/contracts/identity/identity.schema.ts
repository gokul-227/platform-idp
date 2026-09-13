/**
 * The identity schema ids Kratos is configured with, one per file in
 * `ory/kratos`. They are wire values: an identity's `schema_id` is what the
 * console patches to grant or revoke access, and what the guard reads to decide
 * whether a session belongs to staff.
 */

/** Schema self-service registration cannot reach (`selfservice_selectable: false`). */
export const STAFF_SCHEMA = "staff";

/** Everyone else. Revoking console access moves an identity back onto it. */
export const DEFAULT_SCHEMA = "default";
