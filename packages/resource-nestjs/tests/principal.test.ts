import { beforeEach, describe, expect, it } from "vitest";
import { meetsAal, toPrincipal } from "../src/principal";
import { bearerFrom, resolveVerifierOptions } from "../src/verifier";

describe("toPrincipal", () => {
  const valid = { aal: "aal2", email: "a@b.test", sub: "u1", type: "user" };

  it("maps the issuer's claims", () => {
    const principal = toPrincipal(valid);
    expect(principal).toMatchObject({
      aal: "aal2",
      email: "a@b.test",
      subject: "u1",
      type: "user",
    });
  });

  it("refuses a token with no subject", () => {
    expect(toPrincipal({ type: "user" })).toBeNull();
  });

  it("derives type from the subject when the issuer did not state it", () => {
    // Nothing this issuer mints states `type`, so every real token takes this
    // path.
    expect(toPrincipal({ client_id: "c1", sub: "c1" })?.type).toBe("service");
    expect(toPrincipal({ client_id: "c1", sub: "u1" })?.type).toBe("user");
    // No client_id at all: a person, since a machine's subject is its client.
    expect(toPrincipal({ sub: "u1" })?.type).toBe("user");
  });

  it("refuses a stated type it does not recognise", () => {
    // A token asserting something we do not understand is refused rather than
    // reinterpreted: guessing `user` hands a machine a person's reach, and
    // guessing `service` does the reverse.
    expect(toPrincipal({ ...valid, type: "admin" })).toBeNull();
  });

  it("derives rather than refuses when type is empty", () => {
    // An empty string carries no more information than an absent claim, so it
    // takes the same path. Deriving is not a guess: the subject and the client
    // id are the whole of the distinction.
    expect(toPrincipal({ ...valid, client_id: "u1", type: "" })?.type).toBe(
      "service"
    );
  });

  it("floors a missing assurance level at aal0, which satisfies nothing", () => {
    const principal = toPrincipal({ sub: "u1", type: "user" });
    expect(principal?.aal).toBe("aal0");
    expect(meetsAal(principal?.aal ?? "", "aal1")).toBe(false);
  });

  it("leaves unknown claims null rather than empty", () => {
    // Absent must read as unknown. An empty string would read as "has no role".
    const principal = toPrincipal({
      email: "",
      staffRole: "",
      sub: "u1",
      type: "user",
    });
    expect(principal?.email).toBeNull();
    expect(principal?.staffRole).toBeNull();
    expect(principal?.clientId).toBeNull();
  });

  it("accepts a service principal carrying its client id", () => {
    const principal = toPrincipal({
      aal: "aal0",
      clientId: "c1",
      sub: "c1",
      type: "service",
    });
    expect(principal?.type).toBe("service");
    expect(principal?.clientId).toBe("c1");
  });

  it("exposes the raw claims, frozen", () => {
    const principal = toPrincipal({ ...valid, custom: 7 });
    expect(principal?.claims.custom).toBe(7);
    expect(Object.isFrozen(principal?.claims)).toBe(true);
  });
});

describe("meetsAal", () => {
  it("treats the requirement as a floor, not an equality", () => {
    expect(meetsAal("aal2", "aal1")).toBe(true);
    expect(meetsAal("aal1", "aal1")).toBe(true);
    expect(meetsAal("aal1", "aal2")).toBe(false);
  });

  it("admits any verified caller at the aal0 default", () => {
    // A service account has no assurance level to offer, so the default floor
    // has to be one every principal clears.
    expect(meetsAal("aal0", "aal0")).toBe(true);
  });

  it("falls back to equality on an unrecognised spelling, so a typo refuses", () => {
    expect(meetsAal("aal2", "high")).toBe(false);
    expect(meetsAal("high", "high")).toBe(true);
  });
});

describe("bearerFrom", () => {
  it("reads the scheme case-insensitively", () => {
    expect(bearerFrom("Bearer abc")).toBe("abc");
    expect(bearerFrom("bearer abc")).toBe("abc");
  });

  it("ignores any other scheme", () => {
    expect(bearerFrom("Basic abc")).toBeUndefined();
    expect(bearerFrom(undefined)).toBeUndefined();
    expect(bearerFrom("Bearer")).toBeUndefined();
    expect(bearerFrom("Bearer   ")).toBeUndefined();
  });
});

describe("resolveVerifierOptions", () => {
  const AUDIENCE = "https://api.test";
  const ISSUER = "https://id.test/";
  const JWKS_URL = "https://id.test/.well-known/jwks.json";
  const ENV_VARS = ["OIDC_AUDIENCE", "OIDC_ISSUER", "OIDC_JWKS_URL"] as const;

  // Cleared rather than trusted absent: these tests are about what happens when
  // a value is missing, and an ambient OIDC_ISSUER in the shell running them
  // would satisfy the very lookup being asserted on.
  beforeEach(() => {
    for (const name of ENV_VARS) {
      delete process.env[name];
    }
  });

  it("pins issuer and audience, since neither has a safe default of 'any'", () => {
    const resolved = resolveVerifierOptions({
      audience: AUDIENCE,
      issuer: ISSUER,
      jwksUrl: JWKS_URL,
    });
    expect(resolved.audience).toBe(AUDIENCE);
    expect(resolved.issuer).toBe(ISSUER);
  });

  // Each of these had a localhost default, so a service missing one booted and
  // refused every gated route instead of saying what was wrong.
  it.each([
    ["audience", { issuer: ISSUER, jwksUrl: JWKS_URL }],
    ["issuer", { audience: AUDIENCE, jwksUrl: JWKS_URL }],
    ["jwksUrl", { audience: AUDIENCE, issuer: ISSUER }],
  ])("refuses to resolve without %s", (missing, options) => {
    expect(() => resolveVerifierOptions(options)).toThrow(missing as string);
  });

  it("reads a value from the environment when the option is absent", () => {
    process.env.OIDC_AUDIENCE = AUDIENCE;
    expect(
      resolveVerifierOptions({ issuer: ISSUER, jwksUrl: JWKS_URL }).audience
    ).toBe(AUDIENCE);
  });

  it("treats an empty environment value as missing", () => {
    process.env.OIDC_AUDIENCE = "";
    expect(() =>
      resolveVerifierOptions({ issuer: ISSUER, jwksUrl: JWKS_URL })
    ).toThrow("audience");
  });
});

describe("toPrincipal, claims nested under ext", () => {
  // The shape an access token actually carries: the issuer nests whatever it was
  // given at consent under `ext`, so a top-level-only read finds none of it and
  // every value takes its fail-closed default on a token that stated one.
  const accessToken = {
    aud: ["http://localhost:3100"],
    client_id: "5fe2b8d1-6827-476d-b5d5-f37eb8040fef",
    ext: { aal: "aal1", email: "person@example.test", schema: "default" },
    iss: "http://localhost:4444",
    sub: "a0ba8dc4-98d4-41f0-9854-a2209dea9f97",
  };

  it("reads aal and email out of ext", () => {
    const principal = toPrincipal(accessToken);
    expect(principal?.aal).toBe("aal1");
    expect(principal?.email).toBe("person@example.test");
  });

  it("reads client_id, which the issuer spells with an underscore", () => {
    expect(toPrincipal(accessToken)?.clientId).toBe(
      "5fe2b8d1-6827-476d-b5d5-f37eb8040fef"
    );
  });

  it("derives user from a subject that is not the client", () => {
    expect(toPrincipal(accessToken)?.type).toBe("user");
  });

  it("reads staffRole out of ext, which is the only place consent puts it", () => {
    // Read here, honoured by a resource server only for a value that deployment
    // lists, and reachable at all only from a client registered against its
    // audience. Flat-only left the field null on every token this issuer mints,
    // so the staff surface refused admins too.
    const granted = {
      ...accessToken,
      ext: { ...accessToken.ext, staffRole: "admin" },
    };
    expect(toPrincipal(granted)?.staffRole).toBe("admin");
  });

  it("leaves staffRole null when consent emitted none", () => {
    expect(toPrincipal(accessToken)?.staffRole).toBeNull();
  });

  it("still reads a flat token, so both shapes work during a cutover", () => {
    const flat = {
      aal: "aal2",
      email: "flat@example.test",
      sub: "s",
      type: "user",
    };
    const principal = toPrincipal(flat);
    expect(principal?.aal).toBe("aal2");
    expect(principal?.email).toBe("flat@example.test");
  });
});
