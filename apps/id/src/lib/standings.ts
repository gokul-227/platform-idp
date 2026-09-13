import {
  type CallerStanding,
  type GroupStanding,
  grantCeiling,
  mayGrant,
  STANDINGS,
} from "@aec-craft/platform-sdk";

/** The caller's standing on an organization's own group, out of every group they hold. */
export function rootStanding<T extends { groupType: string }>(
  standings: readonly T[]
): T | undefined {
  return standings.find((standing) => standing.groupType === "org");
}

export function ownsOrganization(access: {
  permits: CallerStanding["permits"];
  standing: GroupStanding | null;
}): boolean {
  const own = (access.permits as { own?: boolean }).own;
  return own ?? access.standing === "owner";
}

/** What this caller may grant: platform's own `mayGrant`, so the dialog offers
 *  only what the write would accept. */
export function grantableStandings(access: {
  permits: CallerStanding["permits"];
  standing: GroupStanding | null;
}): GroupStanding[] {
  const permits = {
    admin: access.permits.admin,
    manage: access.permits.manage,
    own: ownsOrganization(access),
  };
  const ceiling = grantCeiling(permits);
  if (!ceiling) {
    return [];
  }
  return STANDINGS.filter((standing) => mayGrant(ceiling, standing));
}
