import type { UiNode, UiNodeInputAttributes } from "@ory/client-fetch";
import type { ReactNode } from "react";

import { Button } from "@/components/vendor/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import type { BrowserFlow } from "@/types/flow";

function isInputAttributes(
  node: UiNode,
): node is UiNode & { attributes: UiNodeInputAttributes } {
  return node.attributes.node_type === "input";
}

function messageText(node: UiNode): string | undefined {
  return node.messages?.[0]?.text;
}

// enterprise-user.schema.json's real trait groups, in the order they should
// read as a form: identity basics, then consent, with anything the schema
// might grow later falling into "Other" rather than being dropped.
//
// Organization membership is intentionally NOT a field group here (tech-
// lead request): a person can belong to multiple organizations, so a
// single traits.organization.* value on the identity schema is misleading
// to show as "your organization" on a personal settings page — real,
// multi-org-aware membership lives on the Organizations console page
// instead. The schema fields themselves are untouched (still real,
// readable/writable via the API); EXCLUDED_PREFIXES below only removes
// them from this page's rendered form, it does not remove them from Kratos.
const FIELD_GROUPS: { heading: string; prefixes: string[] }[] = [
  { heading: "Personal", prefixes: ["traits.email", "traits.username", "traits.name.", "traits.phone", "traits.avatar", "traits.locale", "traits.timezone"] },
  { heading: "Consent", prefixes: ["traits.consent."] },
];

const EXCLUDED_PREFIXES = ["traits.organization.", "traits.status"];

function ProfileInput({ node }: { node: UiNode & { attributes: UiNodeInputAttributes } }): ReactNode {
  const attrs = node.attributes;
  if (attrs.type === "hidden" || attrs.type === "submit") return null;
  const error = messageText(node);
  const label = node.meta.label?.text;
  return (
    <Field data-invalid={error ? true : undefined} key={attrs.name}>
      {label ? <FieldLabel htmlFor={attrs.name}>{label}</FieldLabel> : null}
      <Input
        autoComplete={attrs.autocomplete}
        defaultValue={attrs.value ?? ""}
        disabled={attrs.disabled}
        id={attrs.name}
        name={attrs.name}
        pattern={attrs.pattern}
        required={attrs.required}
        type={attrs.type}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function ProfileSection({ flow }: { flow: BrowserFlow }): ReactNode {
  const allNodes = flow.ui.nodes.filter((n) => n.group === "default" || n.group === "profile");
  const hiddenNodes = allNodes.filter(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && n.attributes.type === "hidden",
  );
  const submitNode = allNodes.find(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && n.attributes.type === "submit",
  );
  const allVisibleNodes = allNodes.filter(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && n.attributes.type !== "hidden" && n.attributes.type !== "submit",
  );
  // Excluded fields (organization/status) are still submitted as hidden
  // inputs carrying their current value, so saving this form doesn't wipe
  // them — they're just not rendered/editable on this page.
  const fieldNodes = allVisibleNodes.filter(
    (n) => !EXCLUDED_PREFIXES.some((p) => n.attributes.name.startsWith(p)),
  );
  const excludedFieldNodes = allVisibleNodes.filter((n) =>
    EXCLUDED_PREFIXES.some((p) => n.attributes.name.startsWith(p)),
  );

  const used = new Set<string>();
  const buckets = FIELD_GROUPS.map(({ heading, prefixes }) => {
    const nodes = fieldNodes.filter((n) => {
      const matches = prefixes.some((p) => n.attributes.name.startsWith(p));
      if (matches) used.add(n.attributes.name);
      return matches;
    });
    return { heading, nodes };
  }).filter((bucket) => bucket.nodes.length > 0);
  const other = fieldNodes.filter((n) => !used.has(n.attributes.name));
  if (other.length > 0) buckets.push({ heading: "Other", nodes: other });

  return (
    <form action={flow.ui.action} className="flex flex-col gap-6" method={flow.ui.method}>
      {hiddenNodes.map((node) => (
        <input key={node.attributes.name} name={node.attributes.name} type="hidden" value={node.attributes.value ?? ""} />
      ))}
      {excludedFieldNodes.map((node) => (
        <input key={node.attributes.name} name={node.attributes.name} type="hidden" value={node.attributes.value ?? ""} />
      ))}
      {buckets.map(({ heading, nodes }) => (
        <div className="flex flex-col gap-3" key={heading}>
          <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{heading}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {nodes.map((node) => (
              <ProfileInput key={node.attributes.name} node={node} />
            ))}
          </div>
        </div>
      ))}
      {submitNode ? (
        <Button name={submitNode.attributes.name} type="submit" value={submitNode.attributes.value ?? ""}>
          {submitNode.meta.label?.text ?? "Save"}
        </Button>
      ) : null}
    </form>
  );
}
