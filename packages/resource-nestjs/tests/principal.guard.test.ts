import { UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "../src/principal";
import { PrincipalGuard } from "../src/principal.guard";
import { PUBLIC_ROUTE, REQUIRED_AAL } from "../src/tokens";
import type { VerificationResult } from "../src/verifier";

const principal: Principal = {
  aal: "aal1",
  claims: {},
  clientId: null,
  email: "a@b.test",
  staffRole: null,
  subject: "u1",
  type: "user",
};

/** Only the two methods the guard calls, keyed by metadata name. */
function reflector(metadata: Record<string, unknown> = {}) {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as never;
}

function context(headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; principal?: unknown } = {
    headers,
  };
  return {
    request,
    executionContext: {
      getClass: () => class {},
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

const accepts = (): Promise<VerificationResult> =>
  Promise.resolve({ ok: true, principal });
const refuses = (): Promise<VerificationResult> =>
  Promise.resolve({ ok: false, reason: "bad-signature" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PrincipalGuard", () => {
  it("attaches the principal to the request when the token verifies", async () => {
    const { request, executionContext } = context({
      authorization: "Bearer t",
    });
    const guard = new PrincipalGuard(reflector(), accepts);
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request.principal).toBe(principal);
  });

  it("refuses a request with no Authorization header", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // Silence the deliberate diagnostic.
    });
    const { executionContext } = context();
    const guard = new PrincipalGuard(reflector(), () =>
      Promise.resolve({ ok: false, reason: "no-token" } as VerificationResult)
    );
    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      UnauthorizedException
    );
    expect(warn).toHaveBeenCalled();
  });

  it("never tells the caller why it refused", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      // Silence the deliberate diagnostic.
    });
    const { executionContext } = context({ authorization: "Bearer forged" });
    const guard = new PrincipalGuard(reflector(), refuses);
    // A forged signature, an expired token and a token for another service must
    // be indistinguishable to the caller: the difference is the attacker's map.
    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      new UnauthorizedException().message
    );
  });

  it("lets a @Public() route through without a token", async () => {
    const { request, executionContext } = context();
    const guard = new PrincipalGuard(
      reflector({ [PUBLIC_ROUTE]: true }),
      // Would refuse if it were consulted; a public route must not consult it.
      refuses
    );
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request.principal).toBeUndefined();
  });

  it("admits any verified caller by default, including a service", async () => {
    // The default floor is aal0: a machine has no assurance level to offer, so
    // requiring one everywhere would refuse every service account.
    const { executionContext } = context({ authorization: "Bearer t" });
    const guard = new PrincipalGuard(reflector(), () =>
      Promise.resolve({
        ok: true,
        principal: { ...principal, aal: "aal0", type: "service" },
      } as VerificationResult)
    );
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });

  it("refuses a verified caller below a route's required assurance", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      // Silence the deliberate diagnostic.
    });
    const { executionContext } = context({ authorization: "Bearer t" });
    const guard = new PrincipalGuard(
      reflector({ [REQUIRED_AAL]: "aal2" }),
      accepts
    );
    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("admits a caller who stepped above the requirement", async () => {
    const { executionContext } = context({ authorization: "Bearer t" });
    const guard = new PrincipalGuard(
      reflector({ [REQUIRED_AAL]: "aal1" }),
      () =>
        Promise.resolve({
          ok: true,
          principal: { ...principal, aal: "aal2" },
        } as VerificationResult)
    );
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });
});
