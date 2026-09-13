import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditResourceLabel,
  auditStatusLabel,
  authMethodLabel,
} from "../audit/audit.labels";
import {
  AUDIT_ACTIONS,
  AUDIT_VERBS,
  isAuditResource,
  isAuditStatus,
  verbsOf,
} from "../audit/audit.vocabulary";

describe("the action vocabulary", () => {
  it("labels every declared action", () => {
    const declared = Object.entries(AUDIT_ACTIONS).flatMap(
      ([resource, verbs]) => verbs.map((verb) => `${resource}.${verb}`)
    );
    const labelled = Object.keys(AUDIT_ACTION_LABELS);
    expect(declared.toSorted()).toEqual(labelled.toSorted());
  });

  it("uses past-tense verbs throughout, as platform's vocabulary does", () => {
    const imperative = AUDIT_VERBS.filter((verb) => !verb.endsWith("ed"));
    expect(imperative).toEqual([]);
  });

  it("keeps every verb a single word, pushing the noun into the resource", () => {
    expect(AUDIT_VERBS.filter((verb) => verb.includes("_"))).toEqual([]);
  });

  it("recognizes only declared resources", () => {
    expect(isAuditResource("identity")).toBe(true);
    expect(isAuditResource("identities")).toBe(false);
  });

  it("recognizes only the three results", () => {
    expect(isAuditStatus("denied")).toBe(true);
    expect(isAuditStatus("refused")).toBe(false);
  });

  it("reports the verbs declared for one resource", () => {
    expect(verbsOf("staff_role")).toEqual(["granted", "revoked"]);
  });
});

describe("labels", () => {
  it("uses the console's own words rather than the raw pair", () => {
    expect(auditActionLabel({ resource: "staff_role", verb: "granted" })).toBe(
      "Staff role granted"
    );
    expect(auditActionLabel({ resource: "identity", verb: "created" })).toBe(
      "User created"
    );
  });

  it("falls back to the pair for an action that ships ahead of its label", () => {
    expect(auditActionLabel({ resource: "widget", verb: "polished" })).toBe(
      "widget polished"
    );
  });

  it("title-cases an unknown resource rather than showing a raw value", () => {
    expect(auditResourceLabel("api_key")).toBe("Api key");
    expect(auditResourceLabel("identity")).toBe("User");
  });

  it("names the three results", () => {
    expect(auditStatusLabel("failure")).toBe("Failed");
    expect(auditStatusLabel("denied")).toBe("Denied");
  });

  it("describes a sign-in method, and says so when there was none", () => {
    expect(authMethodLabel("totp")).toBe("an authenticator app");
    expect(authMethodLabel(null)).toBe("an unrecorded method");
    expect(authMethodLabel("something_new")).toBe("something_new");
  });
});
