import {
  refusalCodeFor,
  type StaffGuardDenialReason,
} from "@aec-craft/platform-id-contracts/guard/guard.denials";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `after` schedules work that outlives the response, which needs a request
// scope the runtime only provides in a real invocation. Run it inline so the
// enqueued write is observable here.
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => unknown) => fn() };
});

const { createSessionGuard } = await import("../src/lib/staff.guard");

const KRATOS = "http://kratos.test";
const CONSOLE = "http://console.test";
const SIGN_IN = "http://id.test/login";

const options = {
  appUrl: CONSOLE,
  kratosPublicUrl: KRATOS,
  signInUrl: SIGN_IN,
};

function request(
  path = "/identities?page=2",
  extraHeaders: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`${CONSOLE}${path}`, {
    headers: { cookie: "ory_kratos_session=abc", ...extraHeaders },
  });
}

function whoami(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
  );
}

const staffAtAal2 = {
  authenticator_assurance_level: "aal2",
  identity: { metadata_public: { staffRole: "admin" }, schema_id: "staff" },
};

beforeEach(() => {
  for (const name of [
    "CONSOLE_URL",
    "ID_APP_URL",
    "KRATOS_PUBLIC_URL",
    "AUDIT_WEBHOOK_SECRET",
  ]) {
    delete process.env[name];
  }
  // A deployment always names at least one root and the console refuses to serve
  // without one, so every case starts from an address no fixture identity has.
  // The cases about a root set their own.
  process.env.ROOT_EMAILS = "nobody@example.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createSessionGuard", () => {
  it("admits a staff identity with a known role at aal2", async () => {
    whoami(staffAtAal2);
    const response = await createSessionGuard(options)(request());
    expect(response.headers.get("X-Access-Denied")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  // The lockout this closes: the bootstrap job leaves an identity it finds alone,
  // so a configured root can sit on the default schema with no role,
  // and the schema and role checks then refused the one account that is supposed
  // to always have a way in. Both of those live in Kratos; the derived role does
  // not, which is what makes the guarantee hold.
  it("admits a configured root with no role, on the default schema", async () => {
    process.env.ROOT_EMAILS = "root@example.test";
    whoami({
      authenticator_assurance_level: "aal2",
      identity: {
        id: "u9",
        schema_id: "default",
        traits: { email: "root@example.test" },
      },
    });
    const response = await createSessionGuard(options)(request());
    expect(response.headers.get("X-Access-Denied")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  // The second factor is what keeps this a break-glass rather than a backdoor:
  // control of the address alone must not be enough.
  it("still requires a second factor from a root", async () => {
    process.env.ROOT_EMAILS = "root@example.test";
    whoami({
      authenticator_assurance_level: "aal1",
      identity: {
        id: "u9",
        schema_id: "default",
        traits: { email: "root@example.test" },
      },
    });
    const response = await createSessionGuard(options)(request());
    expect(response.headers.get("location")).toContain(
      `${KRATOS}/self-service/login/browser`
    );
  });

  // The regression this closes: `whoami.required_aal` is `aal1`, so this
  // endpoint answers 200 with a truthful `aal1` for a session that has a second
  // factor it has not used. Refusing that told every enrolled operator to go
  // and enrol, and the step-up branch below was unreachable.
  it("sends a session below the floor to step-up, not to the dead end", async () => {
    whoami({ ...staffAtAal2, authenticator_assurance_level: "aal1" });
    const response = await createSessionGuard(options)(request());
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      `${KRATOS}/self-service/login/browser`
    );
    expect(location.searchParams.get("aal")).toBe("aal2");
    expect(location.searchParams.get("return_to")).toBe(
      `${CONSOLE}/identities?page=2`
    );
    // Nothing published: a step-up is a step in the flow, not a refusal.
    expect(response.headers.get("X-Access-Denied")).toBeNull();
  });

  it("sends a cookieless request to sign-in, carrying return_to", async () => {
    const bare = new NextRequest(`${CONSOLE}/identities`);
    const response = await createSessionGuard(options)(bare);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(SIGN_IN);
    expect(location.searchParams.get("return_to")).toBe(
      `${CONSOLE}/identities`
    );
    // Coarse on the wire: a response header is published, so it carries what
    // the visitor may know and the precise reason goes to the log instead.
    expect(response.headers.get("X-Access-Denied")).toBeNull();
  });

  it("sends a 403 that may still step up to Kratos, not to sign-in", async () => {
    whoami({ error: { id: "session_aal2_required" } }, 403);
    const response = await createSessionGuard(options)(request());
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      `${KRATOS}/self-service/login/browser`
    );
    expect(location.searchParams.get("aal")).toBe("aal2");
    expect(location.searchParams.get("return_to")).toBe(
      `${CONSOLE}/identities?page=2`
    );
  });

  it("sends any other refusal to sign-in", async () => {
    whoami({ error: { id: "session_inactive" } }, 401);
    const response = await createSessionGuard(options)(request());
    expect(response.headers.get("X-Access-Denied")).toBeNull();
    expect(response.headers.get("location")).toContain(SIGN_IN);
  });

  it("fails closed to the dead end when Kratos is unreachable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Silence the deliberate diagnostic.
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED")))
    );
    const response = await createSessionGuard(options)(request());
    expect(response.headers.get("location")).toBe(
      `${CONSOLE}/denied?code=unavailable`
    );
    expect(logged).toHaveBeenCalled();
  });

  it.each<[StaffGuardDenialReason, Record<string, unknown>]>([
    [
      "not-staff",
      {
        ...staffAtAal2,
        identity: { ...staffAtAal2.identity, schema_id: "default" },
      },
    ],
    ["no-role", { ...staffAtAal2, identity: { schema_id: "staff" } }],
    [
      "unknown-role",
      {
        ...staffAtAal2,
        identity: {
          metadata_public: { staffRole: "owner" },
          schema_id: "staff",
        },
      },
    ],
  ])("makes %s a dead end, never an auth flow", async (reason, session) => {
    whoami(session);
    const response = await createSessionGuard(options)(request());
    expect(response.headers.get("location")).toBe(
      `${CONSOLE}/denied?code=${refusalCodeFor(reason)}`
    );
  });

  it("tells the three no-access reasons apart in the log, not on the wire", () => {
    // The point of the mapping: an operator can still separate them, a visitor
    // cannot. If these ever diverge publicly, the disclosure is back.
    expect(
      ["not-staff", "no-role", "unknown-role"].map((reason) =>
        refusalCodeFor(reason as StaffGuardDenialReason)
      )
    ).toEqual(["no-access", "no-access", "no-access"]);
    expect(refusalCodeFor("aal-step-up-required")).toBeNull();
  });

  it("accepts a configured role vocabulary and assurance level", async () => {
    whoami({
      authenticator_assurance_level: "aal1",
      identity: {
        metadata_public: { staffRole: "auditor" },
        schema_id: "team",
      },
    });
    const response = await createSessionGuard({
      ...options,
      requiredAal: "aal1",
      roles: ["auditor"],
      schema: "team",
    })(request());
    expect(response.headers.get("X-Access-Denied")).toBeNull();
  });

  it("never puts a missing environment variable into a URL", async () => {
    process.env.CONSOLE_URL = CONSOLE;
    const bare = new NextRequest(`${CONSOLE}/identities`);
    const response = await createSessionGuard()(bare);
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("undefined");
    expect(location).toBe(
      `http://localhost:3200/login?return_to=${encodeURIComponent(`${CONSOLE}/identities`)}`
    );
  });

  // The request's origin used to be the last fallback for `appUrl`, which is the
  // base for the /denied redirect: a caller supplying it chooses where a refused
  // operator lands. Refusing names the missing variable instead.
  it("refuses to take the redirect base from the request", async () => {
    const bare = new NextRequest(`${CONSOLE}/identities`);
    await expect(createSessionGuard()(bare)).rejects.toThrow("CONSOLE_URL");
  });
});

describe("a surface that only needs a signed-in user", () => {
  const guard = createSessionGuard({
    ...options,
    requiredAal: "aal1",
    roles: null,
    schema: null,
  });

  it("admits a customer identity with no role", async () => {
    whoami({
      authenticator_assurance_level: "aal1",
      identity: { id: "u1", schema_id: "default" },
    });
    const response = await guard(request("/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("admits a session that stepped above the floor", async () => {
    whoami({
      authenticator_assurance_level: "aal2",
      identity: { id: "u1", schema_id: "default" },
    });
    const response = await guard(request("/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("the staff preset still refuses a customer", () => {
  it("denies a default-schema identity", async () => {
    whoami({
      authenticator_assurance_level: "aal2",
      identity: { id: "u1", schema_id: "default" },
    });
    const guard = createSessionGuard({
      ...options,
    });
    const response = await guard(request("/"));
    expect(response.headers.get("location")).toContain("code=no-access");
  });
});

describe("denial capture", () => {
  it("records a real denied audit event when a hook secret is configured", async () => {
    process.env.AUDIT_WEBHOOK_SECRET = "hook-secret";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/sessions/whoami")) {
        return Promise.resolve(
          Response.json({
            authenticator_assurance_level: "aal2",
            identity: { id: "u1", schema_id: "default" },
          })
        );
      }
      return Promise.resolve(new Response("{}"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await createSessionGuard(options)(
      request("/", {
        "user-agent": "test-agent/1.0",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      })
    );
    expect(response.headers.get("location")).toContain("code=no-access");

    await new Promise((resolve) => setTimeout(resolve, 0));
    const auditCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/internal/audit")
    );
    expect(auditCall).toBeDefined();
    const [, init] = auditCall as [RequestInfo | URL, RequestInit];
    expect(init.headers).toMatchObject({ "x-audit-token": "hook-secret" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      resource: "console_access",
      verb: "denied",
      actorIdentityId: "u1",
      // The first entry in the chain is the original client — the same
      // convention `recordConsoleEvent` and the consent recorder use.
      ip: "203.0.113.9",
      context: { reason: "not-staff" },
      status: "denied",
      userAgent: "test-agent/1.0",
    });
  });

  it("does not record a signed-out visitor, which any caller could provoke", async () => {
    process.env.AUDIT_WEBHOOK_SECRET = "hook-secret";
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 401 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createSessionGuard(options)(
      new NextRequest(`${CONSOLE}/`)
    );
    expect(response.headers.get("location")).toContain(SIGN_IN);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/internal/audit")
      )
    ).toBe(false);
  });

  it("never calls the audit route when no hook secret is configured", async () => {
    whoami({
      authenticator_assurance_level: "aal2",
      identity: { id: "u1", schema_id: "default" },
    });
    const fetchSpy = vi.mocked(fetch);
    await createSessionGuard(options)(request("/"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        String(input).includes("/api/internal/audit")
      )
    ).toBe(false);
  });
});
