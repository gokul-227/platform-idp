import { describe, expect, it } from "vitest";
import { commaList, domainOf, hasAddress } from "../identity/email";

describe("domainOf", () => {
  it("takes the part after the last @, which is the domain", () => {
    expect(domainOf("marius@neobim.ai")).toBe("neobim.ai");
    // A local part may itself contain an @ when quoted; the last one wins.
    expect(domainOf('"odd@name"@neobim.ai')).toBe("neobim.ai");
  });

  it("lowercases, since a domain is not case-sensitive", () => {
    expect(domainOf("MARIUS@NeoBIM.AI")).toBe("neobim.ai");
  });

  it("reports nothing for a string with no domain", () => {
    expect(domainOf("marius")).toBeNull();
    expect(domainOf("marius@")).toBeNull();
  });
});

describe("commaList", () => {
  it("trims, lowercases and drops empties, so a trailing comma is not an entry", () => {
    expect(commaList(" A@x.test , b@y.test ,")).toEqual([
      "a@x.test",
      "b@y.test",
    ]);
    expect(commaList(undefined)).toEqual([]);
    expect(commaList("")).toEqual([]);
  });
});

describe("hasAddress", () => {
  it("compares whole addresses, case-insensitively", () => {
    expect(hasAddress("Root@X.test", ["root@x.test"])).toBe(true);
    expect(hasAddress("root@x.test", ["other@x.test"])).toBe(false);
  });

  it("matches nothing for an empty address, even against an empty entry", () => {
    // Or an identity with no address would be admitted by a misconfigured list.
    expect(hasAddress("", [""])).toBe(false);
  });
});
