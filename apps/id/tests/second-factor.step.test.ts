import type { LoginFlow, UiContainer, UiNode } from "@ory/client-fetch";
import { describe, expect, it } from "vitest";
import {
  isSecondFactorRequired,
  secondFactorStepFromUi,
} from "../src/lib/second-factor.step";

/**
 * The two shapes Kratos serves a step-up flow in, and why the login page needs
 * both: at `?aal=aal2` an identity with an authenticator gets the method nodes,
 * and an identity with none gets a flow carrying only `csrf_token` plus message
 * 1010004. Kratos does not refuse the second case, so nothing but
 * `requested_aal` distinguishes it from an ordinary first-factor sign-in, and
 * reading it wrong puts an unanswerable email form on screen.
 */
function ui(nodes: Partial<UiNode>[]): UiContainer {
  return {
    action: "https://kratos.test/self-service/login?flow=f1",
    method: "POST",
    nodes: nodes as UiNode[],
  };
}

function input(group: string, name: string, type = "text"): Partial<UiNode> {
  return {
    attributes: { disabled: false, name, node_type: "input", type },
    group,
    messages: [],
    type: "input",
  } as Partial<UiNode>;
}

const flowAt = (requestedAal: string): LoginFlow =>
  ({ requested_aal: requestedAal }) as LoginFlow;

describe("secondFactorStepFromUi", () => {
  it("reads the code prompt from an enrolled identity's flow", () => {
    const step = secondFactorStepFromUi(
      ui([
        input("default", "csrf_token", "hidden"),
        input("totp", "totp_code"),
        input("totp", "method", "submit"),
      ])
    );
    expect(step?.totp).toEqual({
      field: "totp_code",
      submit: { name: "method", value: "totp" },
    });
  });

  it("finds no step in the flow of an identity with nothing enrolled", () => {
    expect(
      secondFactorStepFromUi(ui([input("default", "csrf_token", "hidden")]))
    ).toBeNull();
  });
});

describe("isSecondFactorRequired", () => {
  it("holds for a flow minted above aal1, which is the only trace left", () => {
    expect(isSecondFactorRequired(flowAt("aal2"))).toBe(true);
  });

  it("does not hold for an ordinary sign-in", () => {
    expect(isSecondFactorRequired(flowAt("aal1"))).toBe(false);
    expect(isSecondFactorRequired({} as LoginFlow)).toBe(false);
  });
});
