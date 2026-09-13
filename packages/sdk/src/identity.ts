/**
 * Everything derivable from an identity without asking Kratos: traits, whether it
 * is staff, at what role. Free of runtime imports, because a guard evaluates this
 * on every request and must not pull the Ory client into that bundle.
 *
 * The shared vocabulary is bundled in from the internal contracts package rather
 * than depended on: that package is unpublished, so an installed copy of this one
 * must not reach for it.
 */

import { hasAddress } from "@aec-craft/platform-id-contracts/identity/email";
import { STAFF_SCHEMA } from "@aec-craft/platform-id-contracts/identity/identity.schema";
import type {
  IdentityFacts,
  IdentityMetadataPublic,
  IdentityTraits,
} from "@aec-craft/platform-id-contracts/identity/identity.traits";
import {
  STAFF_ROLES,
  type StaffRole,
} from "@aec-craft/platform-id-contracts/identity/staff.roles";

export type {
  IdentityFacts,
  IdentityMetadataPublic,
  IdentityTraits,
} from "@aec-craft/platform-id-contracts/identity/identity.traits";
export type { StaffRole } from "@aec-craft/platform-id-contracts/identity/staff.roles";

export function traitsOf(identity?: IdentityFacts | null): IdentityTraits {
  return (identity?.traits ?? {}) as IdentityTraits;
}

export function emailOf(identity?: IdentityFacts | null): string {
  return traitsOf(identity).email ?? "";
}

/** Falls through to the address then the id, so an identity always renders. */
export function displayNameOf(identity?: IdentityFacts | null): string {
  const traits = traitsOf(identity);
  const name = [traits.name?.first, traits.name?.last]
    .filter(Boolean)
    .join(" ");
  return name || traits.email || identity?.id || "";
}

export function isStaff(
  identity?: IdentityFacts | null,
  schema: string = STAFF_SCHEMA
): boolean {
  return identity?.schema_id === schema;
}

/**
 * The role as written, unvalidated, for callers with their own vocabulary that
 * must tell "no role" from "one I do not recognise". Only the admin API can write
 * `metadata_public`, so an identity cannot promote itself, and reading it off the
 * session means a change lands without a re-login. `metadata_admin` cannot serve
 * this: whoami never returns it.
 */
export function staffRoleValueOf(
  identity?: IdentityFacts | null
): string | undefined {
  const metadata = (identity?.metadata_public ?? {}) as IdentityMetadataPublic;
  return metadata.staffRole;
}

/**
 * Unknown values read as no role at all: an authorization decision on an
 * unrecognised string is a guess, and a guess here fails open.
 */
export function staffRoleOf(identity?: IdentityFacts | null): StaffRole | null {
  const role = staffRoleValueOf(identity);
  return STAFF_ROLES.includes(role as StaffRole) ? (role as StaffRole) : null;
}

/**
 * What somebody may do in the console. Three answers, and only one of them is
 * stored: `staff` is the schema, `admin` is the role beside it, and `root` comes
 * from configuration, so it cannot be granted or revoked through this surface.
 *
 * This is the console's vocabulary, not a resource server's. A token never says
 * `root`: an API compares the address against its own configured list instead, so
 * removing somebody takes effect on the next request rather than when a grant
 * expires.
 */
export type Authority = "admin" | "root" | "staff";

/**
 * The one place an identity becomes an authority.
 *
 * Root is checked first and outranks whatever the identity stores, because it is
 * the standing that must survive anything done to the data.
 *
 * `roots` is passed in rather than read from the environment: this module has no
 * runtime imports, so a guard can evaluate it wherever it already holds config.
 */
export function authorityOf(
  identity: IdentityFacts | null | undefined,
  roots: readonly string[]
): Authority | null {
  if (!identity) {
    return null;
  }
  if (isRoot(identity, roots)) {
    return "root";
  }
  if (!isStaff(identity)) {
    return null;
  }
  return staffRoleOf(identity) ? "admin" : "staff";
}

/** Whether this identity is one of the configured roots. */
export function isRoot(
  identity: IdentityFacts | null | undefined,
  roots: readonly string[]
): boolean {
  return hasAddress(emailOf(identity), roots);
}
