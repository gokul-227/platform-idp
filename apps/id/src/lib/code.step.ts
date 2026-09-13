import type { UiContainer, UiNodeInputAttributes } from "@ory/client-fetch";
import type { CodeStep } from "@/components/code.form";

/** Inputs that carry the address the code was sent to, across flows. */
const EMAIL_FIELDS = ["identifier", "traits.email", "email"];

function inputs(ui: UiContainer): UiNodeInputAttributes[] {
  const result: UiNodeInputAttributes[] = [];
  for (const node of ui.nodes) {
    if (node.attributes.node_type === "input") {
      result.push(node.attributes);
    }
  }
  return result;
}

/**
 * Read a flow's code step, or null when the flow is still on its first
 * screen. Kratos signals the step by rendering a visible `code` input; the
 * buttons it ships alongside differ per flow (registration adds Back), so
 * they are picked out by name rather than position.
 */
export function codeStepFromUi(ui: UiContainer): CodeStep | null {
  const attributes = inputs(ui);
  const isCodeStep = attributes.some(
    (input) => input.name === "code" && input.type !== "hidden"
  );
  if (!isCodeStep) {
    return null;
  }

  const email = attributes.find(
    (input) => EMAIL_FIELDS.includes(input.name) && input.value
  )?.value;

  const step: CodeStep = {
    action: ui.action,
    hiddenFields: attributes
      .filter((input) => input.type === "hidden")
      .map((input) => ({
        name: input.name,
        value: String(input.value ?? ""),
      })),
    // Kratos's own "a code has been sent" notice duplicates the description;
    // only real errors are worth surfacing here.
    messages: ui.messages?.filter((message) => message.type === "error"),
    ...(email ? { email: String(email) } : {}),
  };

  for (const node of ui.nodes) {
    const input = node.attributes;
    if (input.node_type !== "input" || input.type !== "submit") {
      continue;
    }
    const action = {
      label: node.meta.label?.text ?? input.name,
      name: input.name,
      value: String(input.value ?? ""),
    };
    if (input.name === "resend") {
      step.resend = action;
    } else if (input.name === "screen") {
      step.back = { ...action, label: "Use a different address" };
    } else if (input.name === "method" && !step.primary) {
      step.primary = { ...action, label: "Continue" };
    }
  }

  return step;
}
