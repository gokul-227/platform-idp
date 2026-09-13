import type { Identity, Session } from "@ory/client-fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("../src/lib/kratos", () => ({ getSession: () => getSession() }));

beforeEach(() => {
  vi.resetModules();
  getSession.mockReset();
});

function signedInAs(schema: string, staffRole?: string, aal = "aal2"): Session {
  return {
    authenticator_assurance_level: aal,
    identity: {
      id: "identity-1",
      schema_id: schema,
      traits: { email: "a@example.test" },
      ...(staffRole ? { metadata_public: { staffRole } } : {}),
    } as unknown as Identity,
  } as unknown as Session;
}

/** Both halves carry the same claims, so reading either is the same question. */
async function claims(session: Session | null, subject = "identity-1") {
  getSession.mockResolvedValue(session);
  const { consentSessionForSubject } = await import(
    "../src/lib/consent.claims"
  );
  const result = await consentSessionForSubject(subject);
  return (result?.access_token ?? null) as Record<string, unknown> | null;
}

describe("consentSessionForSubject", () => {
  it("states the role the identity stores", async () => {
    expect(await claims(signedInAs("staff", "admin"))).toMatchObject({
      aal: "aal2",
      email: "a@example.test",
      schema: "staff",
      staffRole: "admin",
    });
  });

  it("states no role for staff who hold none, which is most of them", async () => {
    const emitted = await claims(signedInAs("staff"));
    expect(emitted).toMatchObject({ schema: "staff" });
    expect(emitted).not.toHaveProperty("staffRole");
  });

  it("states no role for a value this deployment does not list", async () => {
    // `superadmin` is retired, so an identity still carrying it hands a resource
    // server nothing rather than a word it would have to interpret.
    expect(await claims(signedInAs("staff", "superadmin"))).not.toHaveProperty(
      "staffRole"
    );
  });

  it("refuses a session that is not the subject's", async () => {
    expect(
      await claims(signedInAs("staff", "admin"), "somebody-else")
    ).toBeNull();
  });

  it("refuses when nobody is signed in", async () => {
    expect(await claims(null)).toBeNull();
  });
});

const { sessionForIdentity } = await import("../src/lib/consent.claims");

describe("sessionForIdentity", () => {
  const staff = (metadata: Record<string, unknown> | null) =>
    ({
      id: "id-1",
      metadata_public: metadata,
      schema_id: "staff",
      state: "active",
      traits: { email: "operator@neobim.ai" },
    }) as never;

  it("states the role the identity stores", () => {
    const session = sessionForIdentity(staff({ staffRole: "admin" }), "aal2");
    expect(session.access_token).toEqual({
      aal: "aal2",
      email: "operator@neobim.ai",
      schema: "staff",
      staffRole: "admin",
    });
  });

  it("states no role for a value this deployment does not list", () => {
    const session = sessionForIdentity(
      staff({ staffRole: "superadmin" }),
      "aal2"
    );
    expect(session.access_token).not.toHaveProperty("staffRole");
  });

  it("derives nothing: a root holds the role like anyone who administers", () => {
    const session = sessionForIdentity(staff(null), "aal2");
    expect(session.access_token).not.toHaveProperty("staffRole");
  });

  it("passes the assurance level through, since a refresh cannot change it", () => {
    expect(sessionForIdentity(staff(null), "aal1").access_token).toMatchObject({
      aal: "aal1",
    });
    expect(
      sessionForIdentity(staff(null), null).access_token
    ).not.toHaveProperty("aal");
  });
});
