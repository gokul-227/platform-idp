import type { CallerStanding, GroupStanding } from "@aec-craft/platform-sdk";
import { describe, expect, it, vi } from "vitest";

/**
 * These two functions are the escalation ceiling for the whole organization
 * feature: what `ownsOrganization` gets wrong, `grantableStandings` hands out.
 * Both are pure, so nothing here talks to platform.
 */

vi.mock("server-only", () => ({}));

const { grantableStandings, ownsOrganization } = await import(
  "../src/lib/standings"
);

function access(
  permits: Partial<CallerStanding["permits"]>,
  standing: GroupStanding | null
): { permits: CallerStanding["permits"]; standing: GroupStanding | null } {
  return {
    permits: {
      admin: false,
      manage: false,
      read: false,
      write: false,
      ...permits,
    },
    standing,
  };
}

describe("ownsOrganization", () => {
  it("trusts an explicit `own` permit over the standing", () => {
    expect(ownsOrganization(access({ own: true } as never, "admin"))).toBe(
      true
    );
  });

  it("falls back to the standing when `own` is absent from the response", () => {
    expect(ownsOrganization(access({}, "owner"))).toBe(true);
    expect(ownsOrganization(access({}, "admin"))).toBe(false);
  });

  it("does not infer ownership from admin permits alone", () => {
    expect(ownsOrganization(access({ admin: true }, null))).toBe(false);
  });
});

describe("grantableStandings", () => {
  it("lets an owner grant every standing, including a peer owner", () => {
    expect(grantableStandings(access({ own: true } as never, "owner"))).toEqual(
      ["owner", "admin", "manager", "editor", "viewer"]
    );
  });

  it("keeps an admin strictly below owner", () => {
    expect(grantableStandings(access({ admin: true }, "admin"))).toEqual([
      "admin",
      "manager",
      "editor",
      "viewer",
    ]);
  });

  it("keeps a manager strictly below manager", () => {
    expect(grantableStandings(access({ manage: true }, "manager"))).toEqual([
      "editor",
      "viewer",
    ]);
  });

  it("grants nothing to an editor or a viewer", () => {
    expect(grantableStandings(access({ write: true }, "editor"))).toEqual([]);
    expect(grantableStandings(access({ read: true }, "viewer"))).toEqual([]);
  });
});
