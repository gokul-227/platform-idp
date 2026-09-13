import type { UiContainer, UiNode } from "@ory/client-fetch";
import type {
  SecondFactorMethod,
  SecondFactorStep,
} from "@/components/second-factor.form";
import type { BrowserFlow } from "@/lib/kratos";

/**
 * Kratos groups the second-factor nodes by method, so the group is what
 * identifies the step. Reading it by group rather than by field name keeps
 * this working across the two spellings Kratos uses for the inputs
 * (`totp_code`, `lookup_secret`).
 */
const METHOD_GROUPS = ["totp", "lookup_secret"] as const;

function readMethod(
  nodes: UiNode[],
  group: (typeof METHOD_GROUPS)[number]
): SecondFactorMethod | null {
  let field: string | null = null;
  let submit: { name: string; value: string } | null = null;

  for (const node of nodes) {
    const input = node.attributes;
    if (node.group !== group || input.node_type !== "input") {
      continue;
    }
    if (input.type === "submit") {
      submit = { name: input.name, value: String(input.value ?? group) };
    } else if (input.type !== "hidden") {
      field = input.name;
    }
  }

  return field && submit ? { field, submit } : null;
}

/**
 * Read a login flow's second-factor step, or null when the flow is a normal
 * first-factor sign-in. Kratos serves this whenever the requested AAL is
 * higher than the session's, which for the console is every sign-in.
 */
export function secondFactorStepFromUi(
  ui: UiContainer
): SecondFactorStep | null {
  const totp = readMethod(ui.nodes, "totp");
  const lookupSecret = readMethod(ui.nodes, "lookup_secret");
  if (!(totp || lookupSecret)) {
    return null;
  }

  // By name: the same hidden input (csrf_token) is repeated per method group.
  const hiddenFields = new Map<string, string>();
  for (const node of ui.nodes) {
    const input = node.attributes;
    if (input.node_type === "input" && input.type === "hidden") {
      hiddenFields.set(input.name, String(input.value ?? ""));
    }
  }

  return {
    action: ui.action,
    hiddenFields: [...hiddenFields].map(([name, value]) => ({ name, value })),
    // Kratos's own "complete the second authentication challenge" notice says
    // less than the screen around it; only real errors are worth surfacing.
    messages: ui.messages?.filter((message) => message.type === "error"),
    ...(totp ? { totp } : {}),
    ...(lookupSecret ? { lookupSecret } : {}),
  };
}

/**
 * Whether the flow was minted for an assurance level above AAL1, which is the
 * only place that intent is stated. A flow whose requested level the identity
 * cannot reach arrives with no method on it, and is otherwise indistinguishable
 * from an ordinary first-factor sign-in.
 */
export function isSecondFactorRequired(flow: BrowserFlow): boolean {
  const requested = "requested_aal" in flow ? flow.requested_aal : undefined;
  return Boolean(requested) && requested !== "aal1";
}
