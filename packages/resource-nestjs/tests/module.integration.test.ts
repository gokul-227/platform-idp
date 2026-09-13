import { createServer, type Server } from "node:http";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, type KeyObject, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PlatformIdModule } from "../src/platform-id.module";
import { PrincipalGuard } from "../src/principal.guard";
import { PUBLIC_ROUTE, REQUIRED_AAL } from "../src/tokens";

/**
 * What the unit tests cannot reach: the module actually wiring, and real
 * signature verification against a real key set over HTTP.
 *
 * The unit tests inject a stub verifier, so they prove the guard's decisions and
 * nothing about whether `forRoot` provides anything, whether Nest can construct
 * the guard, or whether `jose` verifies what the issuer signs. A package that
 * fails all three would still pass them.
 */

const ISSUER = "http://issuer.test/";
const AUDIENCE = "probe-api";

let jwks: Server;
let port: number;
let signingKey: KeyObject | CryptoKey;
let otherKey: KeyObject | CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "k1" };

  jwks = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => {
    jwks.listen(0, "127.0.0.1", resolve);
  });
  const address = jwks.address();
  port = typeof address === "object" && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    jwks.close(() => resolve());
  });
});

function sign(
  claims: Record<string, unknown>,
  options: { audience?: string; issuer?: string; key?: unknown } = {}
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime("5m")
    .sign((options.key ?? signingKey) as Parameters<SignJWT["sign"]>[0]);
}

/** Enough of an ExecutionContext for the guard, with the metadata it reads. */
function contextFor(
  token: string | undefined,
  metadata: Record<string, unknown> = {}
) {
  const request: { headers: Record<string, string>; principal?: unknown } = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    request,
    executionContext: {
      getClass: () => class {},
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

async function buildGuard(): Promise<PrincipalGuard> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformIdModule.forRoot({
        audience: AUDIENCE,
        issuer: ISSUER,
        jwksUrl: `http://127.0.0.1:${port}/jwks.json`,
      }),
    ],
  }).compile();
  return moduleRef.get(PrincipalGuard);
}

describe("PlatformIdModule.forRoot", () => {
  it("provides a guard Nest can construct with its dependencies", async () => {
    // Fails if `forRoot` forgets the verifier provider, if the guard's
    // parameter decorators did not survive the build, or if `Reflector` is not
    // resolvable: none of which a stubbed unit test would notice.
    const guard = await buildGuard();
    expect(guard).toBeInstanceOf(PrincipalGuard);
  });

  it("verifies a real signature against the published key set", async () => {
    const guard = await buildGuard();
    const { request, executionContext } = contextFor(
      await sign({ aal: "aal2", email: "a@b.test", sub: "u1", type: "user" })
    );
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request.principal).toMatchObject({
      aal: "aal2",
      email: "a@b.test",
      subject: "u1",
      type: "user",
    });
  });

  it("refuses a token signed by a key the set does not publish", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      // Silence the deliberate diagnostic.
    });
    const guard = await buildGuard();
    const { executionContext } = contextFor(
      await sign({ aal: "aal2", sub: "u1", type: "user" }, { key: otherKey })
    );
    await expect(guard.canActivate(executionContext)).rejects.toThrow();
  });

  it("refuses a token minted for another audience", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      // Without the audience pin this token would be accepted here, which is
      // the whole reason the pin is not optional.
      return;
    });
    const guard = await buildGuard();
    const { executionContext } = contextFor(
      await sign(
        { aal: "aal2", sub: "u1", type: "user" },
        { audience: "other-api" }
      )
    );
    await expect(guard.canActivate(executionContext)).rejects.toThrow();
  });

  it("refuses a token from another issuer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      return;
    });
    const guard = await buildGuard();
    const { executionContext } = contextFor(
      await sign(
        { aal: "aal2", sub: "u1", type: "user" },
        { issuer: "http://elsewhere.test/" }
      )
    );
    await expect(guard.canActivate(executionContext)).rejects.toThrow();
  });

  it("refuses an expired token", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      return;
    });
    const guard = await buildGuard();
    const expired = await new SignJWT({ aal: "aal2", sub: "u1", type: "user" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("-1m")
      .sign(signingKey as Parameters<SignJWT["sign"]>[0]);
    const { executionContext } = contextFor(expired);
    await expect(guard.canActivate(executionContext)).rejects.toThrow();
  });

  it("honours @Public() without fetching a key", async () => {
    const guard = await buildGuard();
    const { request, executionContext } = contextFor(undefined, {
      [PUBLIC_ROUTE]: true,
    });
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request.principal).toBeUndefined();
  });

  it("honours @RequireAal() against real claims", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      return;
    });
    const guard = await buildGuard();
    const weak = contextFor(
      await sign({ aal: "aal1", sub: "u1", type: "user" }),
      {
        [REQUIRED_AAL]: "aal2",
      }
    );
    await expect(guard.canActivate(weak.executionContext)).rejects.toThrow();

    const strong = contextFor(
      await sign({ aal: "aal2", sub: "u1", type: "user" }),
      { [REQUIRED_AAL]: "aal2" }
    );
    await expect(guard.canActivate(strong.executionContext)).resolves.toBe(
      true
    );
  });
});
