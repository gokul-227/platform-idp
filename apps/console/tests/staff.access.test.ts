import { STAFF_SCHEMA } from "@aec-craft/platform-id-contracts/identity/identity.schema";
import type { Identity } from "@ory/client-fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT_EMAIL = "root@example.test";

/**
 * `ROOT_EMAILS` is read per call, so it can be set here rather than before the
 * import. Reset anyway: these cases are about an unset list as well as a set one.
 */
beforeEach(() => {
  vi.resetModules();
  process.env.ROOT_EMAILS = ROOT_EMAIL;
});

function identity(
  email: string,
  role: string | null,
  schema?: string
): Identity {
  return {
    id: "target-1",
    schema_id: schema ?? (role ? STAFF_SCHEMA : "default"),
    traits: { email },
    ...(role ? { metadata_public: { staffRole: role } } : {}),
  } as unknown as Identity;
}

const asRoot = () => ({
  authority: "root" as const,
  id: "actor-1",
  identity: {} as Identity,
});

const asAdmin = () => ({
  authority: "admin" as const,
  id: "actor-1",
  identity: {} as Identity,
});

describe("authorityOf", () => {
  it("reads a root from configuration, whatever the identity stores", async () => {
    const { authorityOf } = await import("@aec-craft/platform-id-sdk/identity");
    const roots = [ROOT_EMAIL];
    // No role, and not even on the staff schema: the address is the whole of it.
    expect(authorityOf(identity(ROOT_EMAIL, null), roots)).toBe("root");
    // A stored role cannot lower it, and an unrecognised one cannot either.
    expect(authorityOf(identity(ROOT_EMAIL, "auditor"), roots)).toBe("root");
  });

  it("reads everybody else off the identity", async () => {
    const { authorityOf } = await import("@aec-craft/platform-id-sdk/identity");
    const roots = [ROOT_EMAIL];
    expect(authorityOf(identity("other@example.test", "admin"), roots)).toBe(
      "admin"
    );
    // On the schema with no role: internal, and nothing more.
    expect(
      authorityOf(identity("other@example.test", null, STAFF_SCHEMA), roots)
    ).toBe("staff");
    expect(authorityOf(identity("other@example.test", null), roots)).toBeNull();
  });

  it("matches nobody when the list is empty", async () => {
    const { authorityOf } = await import("@aec-craft/platform-id-sdk/identity");
    expect(authorityOf(identity(ROOT_EMAIL, null), [])).toBeNull();
    // An identity with no address must not match an empty entry either.
    expect(authorityOf(identity("", null), [""])).toBeNull();
  });

  it("refuses a role this deployment does not list", async () => {
    const { authorityOf } = await import("@aec-craft/platform-id-sdk/identity");
    // `superadmin` is retired, so an identity still carrying it is staff.
    expect(
      authorityOf(identity("other@example.test", "superadmin"), [ROOT_EMAIL])
    ).toBe("staff");
  });
});

describe("assertAccessChange", () => {
  // The platform reads the stored role, not `ROOT_EMAILS`, so a root has to be
  // able to hold `admin` in the identity; only a root may put it there.
  it("lets a root write admin onto a root, and nobody else", async () => {
    const { assertAccessChange } = await import("../src/lib/staff");
    const target = identity(ROOT_EMAIL, null);
    expect(() => assertAccessChange(asRoot(), target, "admin")).not.toThrow();
    expect(() => assertAccessChange(asAdmin(), target, "admin")).toThrow();
  });

  it("lets only a root appoint an admin, and only a root unappoint one", async () => {
    const { assertAccessChange } = await import("../src/lib/staff");
    const plain = identity("someone@example.test", null, STAFF_SCHEMA);
    const admin = identity("someone@example.test", "admin");
    expect(() => assertAccessChange(asRoot(), plain, "admin")).not.toThrow();
    expect(() => assertAccessChange(asAdmin(), plain, "admin")).toThrow();
    // Both directions: an admin who could unappoint one could clear the way.
    expect(() => assertAccessChange(asAdmin(), admin, null)).toThrow();
    expect(() => assertAccessChange(asRoot(), admin, null)).not.toThrow();
  });

  it("lets an admin grant and revoke the staff pool", async () => {
    const { assertAccessChange } = await import("../src/lib/staff");
    const plain = identity("someone@example.test", null);
    expect(() => assertAccessChange(asAdmin(), plain, "staff")).not.toThrow();
    expect(() => assertAccessChange(asAdmin(), plain, null)).not.toThrow();
  });

  it("refuses a caller with no session", async () => {
    const { assertAccessChange } = await import("../src/lib/staff");
    expect(() =>
      assertAccessChange(null, identity("a@example.test", null), "admin")
    ).toThrow();
  });
});
