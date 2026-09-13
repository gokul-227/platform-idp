import type { LoginFlow } from "@ory/client-fetch";
import { describe, expect, it } from "vitest";
import { healedAddress, restartAddress } from "../src/lib/login.address";

/**
 * What a replacement flow inherits. Kratos hands the login UI `?flow=` alone,
 * and a flow is re-minted from the URL, so a challenge or a destination that
 * stays on the flow record is dropped the moment the record is: the sign-in
 * completes as an ordinary one and the application that asked for it never
 * hears back.
 */
const flow = (fields: Partial<LoginFlow>): LoginFlow =>
  ({ id: "f1", ...fields }) as LoginFlow;

const CHALLENGE = "challenge-abc";
const CONSOLE = "http://localhost:3201/identities";

describe("healedAddress", () => {
  it("states the authorize request the flow arrived with", () => {
    expect(
      healedAddress(flow({ oauth2_login_challenge: CHALLENGE }), { flow: "f1" })
    ).toBe(`/login?flow=f1&login_challenge=${CHALLENGE}`);
  });

  it("states where the flow was told to return", () => {
    expect(healedAddress(flow({ return_to: CONSOLE }), { flow: "f1" })).toBe(
      `/login?flow=f1&return_to=${encodeURIComponent(CONSOLE)}`
    );
  });

  // Or the page redirects to itself for as long as the visitor waits.
  it("stops once the address says it, whatever the spelling", () => {
    expect(
      healedAddress(flow({ oauth2_login_challenge: CHALLENGE }), {
        flow: "f1",
        login_challenge: "spelled-differently",
      })
    ).toBeNull();
  });

  it("leaves an ordinary sign-in alone, so it pays no redirect", () => {
    expect(healedAddress(flow({}), { flow: "f1" })).toBeNull();
  });
});

describe("restartAddress", () => {
  it("keeps the request when another account is chosen", () => {
    expect(
      restartAddress(
        flow({ oauth2_login_challenge: CHALLENGE, return_to: CONSOLE })
      )
    ).toBe(
      `/login?login_challenge=${CHALLENGE}&return_to=${encodeURIComponent(CONSOLE)}`
    );
  });

  it("is bare when there is no request to keep", () => {
    expect(restartAddress(flow({}))).toBe("/login");
  });
});
