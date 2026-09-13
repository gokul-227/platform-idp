import { describe, expect, it } from "vitest";
import { parseAuditIntake } from "../audit/audit.intake";

const valid = { resource: "session", verb: "created" };

describe("parseAuditIntake", () => {
  it("accepts a declared pair", () => {
    const result = parseAuditIntake(valid);
    expect(result.ok).toBe(true);
  });

  it("refuses a resource outside the vocabulary", () => {
    expect(parseAuditIntake({ resource: "anything", verb: "created" })).toEqual(
      {
        ok: false,
        error: "unknown resource",
      }
    );
  });

  it("refuses a verb the resource does not declare", () => {
    expect(parseAuditIntake({ resource: "session", verb: "rotated" })).toEqual({
      ok: false,
      error: "unknown verb for resource session",
    });
  });

  it("refuses a body that is not an object", () => {
    expect(parseAuditIntake("session.created").ok).toBe(false);
    expect(parseAuditIntake([valid]).ok).toBe(false);
  });

  it("refuses an unknown status rather than storing it", () => {
    expect(parseAuditIntake({ ...valid, status: "refused" }).ok).toBe(false);
  });

  it("normalizes a missing text field to null rather than undefined", () => {
    const result = parseAuditIntake(valid);
    if (!result.ok) {
      throw new Error("expected the body to parse");
    }
    expect(result.value.actorEmail).toBeNull();
    expect(result.value.ip).toBeNull();
  });

  it("treats an empty string as an absent value", () => {
    const result = parseAuditIntake({ ...valid, actorName: "" });
    if (!result.ok) {
      throw new Error("expected the body to parse");
    }
    expect(result.value.actorName).toBeNull();
  });

  it("refuses a text field that is not text", () => {
    expect(parseAuditIntake({ ...valid, actorEmail: 42 })).toEqual({
      ok: false,
      error: "actorEmail must be a string",
    });
  });

  it("defaults both bags to empty objects", () => {
    const result = parseAuditIntake(valid);
    if (!result.ok) {
      throw new Error("expected the body to parse");
    }
    expect(result.value.context).toEqual({});
    expect(result.value.payload).toEqual({});
  });

  it("refuses a bag that is not an object", () => {
    expect(parseAuditIntake({ ...valid, context: "aal2" }).ok).toBe(false);
  });
});
