import { auditActionLabel } from "@aec-craft/platform-id-contracts/audit/audit.labels";
import { describe, expect, it } from "vitest";
import { applicationCellLabel, itemLabel } from "./audit.event";

describe("auditActionLabel", () => {
  it("reads the console's own words for the pair", () => {
    expect(
      auditActionLabel({ resource: "application_secret", verb: "rotated" })
    ).toBe("Client secret rotated");
  });
});

describe("itemLabel", () => {
  it("prefers the recorded name over the raw id", () => {
    expect(
      itemLabel({ resourceId: "abc", resourceLabel: "marius@neobim.ai" })
    ).toBe("marius@neobim.ai");
  });

  it("falls back to the id, then to a dash", () => {
    expect(itemLabel({ resourceId: "abc", resourceLabel: null })).toBe("abc");
    expect(itemLabel({ resourceId: null, resourceLabel: null })).toBe("—");
  });
});

describe("applicationCellLabel", () => {
  it("stays blank when the item already is the application", () => {
    expect(
      applicationCellLabel({ resource: "application", applicationName: "CBM" })
    ).toBe("—");
    expect(
      applicationCellLabel({
        resource: "application_secret",
        applicationName: "CBM",
      })
    ).toBe("—");
  });

  it("names the client an event happened through", () => {
    expect(
      applicationCellLabel({
        resource: "oauth_consent",
        applicationName: "CBM",
      })
    ).toBe("CBM");
  });
});
