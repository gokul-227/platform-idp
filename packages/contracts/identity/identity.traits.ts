/**
 * The identity shapes every buildOS ID surface reads. Types only, and free of
 * imports on purpose: a Next.js guard evaluates this vocabulary on every
 * request, and it must not pull anything into that bundle to do it.
 */

/**
 * Both identity schemas declare the same traits, so one shape covers customers
 * and staff alike. `email` is the only required trait and doubles as the
 * sign-in identifier, which Kratos keeps unique across every schema.
 */
export interface IdentityTraits {
  email?: string;
  name?: { first?: string; last?: string };
}

/**
 * Admin-written facts on an identity, and where console access lives.
 *
 * `metadata_public`, not `metadata_admin`: only the admin API can write it, so
 * an identity cannot promote itself through the settings flow, and
 * `/sessions/whoami` returns it, so a guard can gate a session on it. Kratos
 * never returns `metadata_admin` there, so it could not serve this at all.
 */
export interface IdentityMetadataPublic {
  staffRole?: string;
}

/**
 * The identity fields these contracts describe. Structural, so both `Identity`
 * from `@ory/client-fetch` (which types `traits` as `any`) and the minimal shape
 * a caller parsed out of a whoami response satisfy it.
 */
export interface IdentityFacts {
  id?: string;
  metadata_public?: unknown;
  schema_id?: string;
  traits?: unknown;
}
