import { describe, expect, it } from "vitest";
import {
  mayRegister,
  registrationPolicy,
} from "../identity/registration.domains";

const bounded = registrationPolicy(undefined, "neobim.ai,neobim.eu");

describe("registrationPolicy", () => {
  it("opens only on a literal true", () => {
    expect(registrationPolicy("true", "").open).toBe(true);
    expect(registrationPolicy("TRUE", "").open).toBe(true);
    expect(registrationPolicy(" true ", "").open).toBe(true);
  });

  it("stays closed for anything else, so a typo does not open it", () => {
    for (const value of ["1", "yes", "on", "", " ", undefined, "false"]) {
      expect(registrationPolicy(value, "neobim.ai").open).toBe(false);
    }
  });

  it("reads the list, trimmed and lowercased", () => {
    const policy = registrationPolicy(undefined, " Acme.test , example.org ");
    expect(policy).toEqual({
      open: false,
      domains: ["acme.test", "example.org"],
    });
  });

  it("holds no domains when none are configured, rather than inventing some", () => {
    expect(registrationPolicy(undefined, undefined)).toEqual({
      open: false,
      domains: [],
    });
    expect(registrationPolicy(undefined, " , ")).toEqual({
      open: false,
      domains: [],
    });
  });
});

describe("mayRegister", () => {
  it("admits an address on a listed domain, whatever its case", () => {
    expect(mayRegister("marius@neobim.ai", bounded)).toBe(true);
    expect(mayRegister("Marius@NEOBIM.EU", bounded)).toBe(true);
  });

  it("refuses one that is not listed", () => {
    expect(mayRegister("someone@gmail.com", bounded)).toBe(false);
  });

  it("refuses a domain that merely ends with a listed one", () => {
    expect(mayRegister("attacker@notneobim.ai", bounded)).toBe(false);
  });

  it("refuses a listed domain used as a prefix of another", () => {
    expect(mayRegister("attacker@neobim.ai.attacker.test", bounded)).toBe(
      false
    );
  });

  it("refuses a string that is not an address at all", () => {
    expect(mayRegister("", bounded)).toBe(false);
    expect(mayRegister("neobim.ai", bounded)).toBe(false);
  });

  it("admits anyone once registration is open, list or no list", () => {
    const open = registrationPolicy("true", "");
    expect(mayRegister("someone@gmail.com", open)).toBe(true);
    expect(mayRegister("anyone@anywhere.test", open)).toBe(true);
  });

  it("admits nobody when closed with an empty list", () => {
    const empty = registrationPolicy(undefined, undefined);
    expect(mayRegister("marius@neobim.ai", empty)).toBe(false);
    expect(mayRegister("someone@gmail.com", empty)).toBe(false);
  });
});
