import { describe, expect, it } from "vitest";
import {
  displayNameOf,
  emailOf,
  isStaff,
  staffRoleOf,
  staffRoleValueOf,
} from "../src/identity";

describe("staff facts", () => {
  it("reads the role from metadata_public", () => {
    expect(staffRoleOf({ metadata_public: { staffRole: "admin" } })).toBe(
      "admin"
    );
  });

  it("reads a retired role as no role, so a leftover value grants nothing", () => {
    expect(
      staffRoleOf({ metadata_public: { staffRole: "superadmin" } })
    ).toBeNull();
    // The written value is still readable, for a caller that must tell "none"
    // from "one I do not recognise".
    expect(
      staffRoleValueOf({ metadata_public: { staffRole: "superadmin" } })
    ).toBe("superadmin");
  });

  it("treats an unrecognised role as no role", () => {
    const identity = { metadata_public: { staffRole: "owner" } };
    expect(staffRoleValueOf(identity)).toBe("owner");
    expect(staffRoleOf(identity)).toBeNull();
  });

  it("treats a missing identity as no role and not staff", () => {
    expect(staffRoleOf(null)).toBeNull();
    expect(isStaff(null)).toBe(false);
  });

  it("is staff only on the staff schema", () => {
    expect(isStaff({ schema_id: "staff" })).toBe(true);
    expect(isStaff({ schema_id: "default" })).toBe(false);
    expect(isStaff({ schema_id: "internal" }, "internal")).toBe(true);
  });
});

describe("traits", () => {
  it("prefers the name, then the address, then the id", () => {
    expect(
      displayNameOf({ traits: { name: { first: "Ada", last: "Lovelace" } } })
    ).toBe("Ada Lovelace");
    expect(displayNameOf({ traits: { email: "ada@example.com" } })).toBe(
      "ada@example.com"
    );
    expect(displayNameOf({ id: "abc", traits: {} })).toBe("abc");
  });

  it("survives an identity with no traits at all", () => {
    expect(emailOf({})).toBe("");
    expect(displayNameOf(null)).toBe("");
  });
});
