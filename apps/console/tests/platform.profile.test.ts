import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The deletion half of the identity seam: the platform row goes first, so a
 * refusal arrives while the identity still exists to hand over from.
 */

const IDENTITY = "94b77d1e-da5f-4dd4-9f62-382559c0d726";

const users = { delete: vi.fn(), list: vi.fn() };
vi.mock("@/lib/platform.admin.client", () => ({
  requireAdminClient: async () => ({ users }),
}));
const isConfigured = vi.fn(() => true);
vi.mock("@/lib/platform.auth", () => ({
  isPlatformAuthConfigured: () => isConfigured(),
}));

beforeEach(() => {
  users.delete.mockReset();
  users.list.mockReset();
  isConfigured.mockReturnValue(true);
});

describe("removePlatformProfile", () => {
  // A console with no platform registration is a real deployment, and it keeps
  // no profiles; refusing every delete there would block the identity work.
  it("asks nothing of a platform this console is not registered with", async () => {
    const { removePlatformProfile } = await import(
      "../src/lib/platform.profile"
    );
    isConfigured.mockReturnValue(false);

    await removePlatformProfile(IDENTITY);

    expect(users.list).not.toHaveBeenCalled();
  });

  it("deletes the profile found by the identity provider's id", async () => {
    const { removePlatformProfile } = await import(
      "../src/lib/platform.profile"
    );
    users.list.mockResolvedValue({ items: [{ id: "u-1" }] });
    users.delete.mockResolvedValue(undefined);

    await removePlatformProfile(IDENTITY);

    expect(users.list).toHaveBeenCalledWith({ externalId: `eq.${IDENTITY}` });
    expect(users.delete).toHaveBeenCalledWith("u-1");
  });

  // An identity that never signed in has no row, and that is not a failure.
  it("does nothing when there is no profile", async () => {
    const { removePlatformProfile } = await import(
      "../src/lib/platform.profile"
    );
    users.list.mockResolvedValue({ items: [] });

    await removePlatformProfile(IDENTITY);

    expect(users.delete).not.toHaveBeenCalled();
  });

  it("lets the platform's refusal through untouched", async () => {
    const { removePlatformProfile } = await import(
      "../src/lib/platform.profile"
    );
    users.list.mockResolvedValue({ items: [{ id: "u-1" }] });
    const refusal = Object.assign(new Error("last owner"), {
      code: "USER_DELETE_BLOCKED_LAST_OWNER",
    });
    users.delete.mockRejectedValue(refusal);

    await expect(removePlatformProfile(IDENTITY)).rejects.toBe(refusal);
  });
});
