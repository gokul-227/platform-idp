import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("../src/client", () => ({ db: () => ({ insert }) }));

const { recordEvent } = await import("../src/audit.repository");

/** One `values()` call, so the row written can be asserted. */
function capture(): { row: () => Record<string, unknown> } {
  const values = vi.fn().mockResolvedValue(undefined);
  insert.mockReturnValue({ values });
  return { row: () => values.mock.calls[0]?.[0] as Record<string, unknown> };
}

beforeEach(() => {
  insert.mockReset();
});

describe("recordEvent", () => {
  it("swallows a write failure rather than throwing", async () => {
    insert.mockImplementation(() => {
      throw new Error("connection refused");
    });
    await expect(
      recordEvent({ resource: "identity", verb: "created" })
    ).resolves.toBeUndefined();
  });

  it("writes the pair as two columns, not one fused string", async () => {
    const captured = capture();
    await recordEvent({ resource: "staff_role", verb: "granted" });
    expect(captured.row()).toMatchObject({
      resource: "staff_role",
      verb: "granted",
    });
  });

  it("defaults an unstated result to success and actor to a person", async () => {
    const captured = capture();
    await recordEvent({ resource: "session", verb: "created" });
    expect(captured.row()).toMatchObject({
      status: "success",
      actorType: "user",
    });
  });

  it("keeps the actor snapshot beside the canonical id", async () => {
    const captured = capture();
    await recordEvent({
      resource: "identity",
      verb: "deleted",
      actorIdentityId: "id-1",
      actorEmail: "marius@neobim.ai",
      actorName: "Marius Bauer",
    });
    expect(captured.row()).toMatchObject({
      actorIdentityId: "id-1",
      actorEmail: "marius@neobim.ai",
      actorName: "Marius Bauer",
    });
  });

  it("stores an absent optional as null rather than undefined", async () => {
    const captured = capture();
    await recordEvent({ resource: "identity", verb: "created" });
    const row = captured.row();
    expect(row.actorIdentityId).toBeNull();
    expect(row.resourceLabel).toBeNull();
    expect(row.applicationId).toBeNull();
  });

  it("defaults the context bag but leaves the payload absent", async () => {
    const captured = capture();
    await recordEvent({ resource: "identity", verb: "created" });
    expect(captured.row().context).toEqual({});
    expect(captured.row().payload).toBeNull();
  });
});
