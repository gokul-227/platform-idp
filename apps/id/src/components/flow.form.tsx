import { Button } from "@aec-craft/ui/components/primitives/button";
import { Checkbox } from "@aec-craft/ui/components/primitives/checkbox";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { Label } from "@aec-craft/ui/components/primitives/label";
import type {
  UiContainer,
  UiNode,
  UiNodeInputAttributes,
  UiText,
} from "@ory/client-fetch";
import type { ReactNode } from "react";
import { messageText } from "@/lib/flow.copy";

/**
 * Renders a flow's `ui` container into a plain HTML form that posts straight to
 * Kratos, which handles CSRF and redirects back. No client JS.
 *
 * WebAuthn and passkey nodes are skipped: Kratos delivers those as `script` nodes
 * it expects the page to execute, which is a client component of its own.
 */
export function FlowForm({
  ui,
  hiddenProviders = [],
  groups,
  showMessages = true,
}: {
  ui: UiContainer;
  /** OIDC provider ids kept off the button row (enterprise SSO connections). */
  hiddenProviders?: string[];
  /**
   * Render only these node groups (plus the hidden `default` nodes every
   * form needs, e.g. csrf_token). Used to split the settings flow into
   * per-concern sections.
   */
  groups?: string[];
  showMessages?: boolean;
}): ReactNode {
  const nodes = ui.nodes.filter((node) => {
    if (
      node.group === "oidc" &&
      node.attributes.node_type === "input" &&
      hiddenProviders.includes(String(node.attributes.value))
    ) {
      return false;
    }
    if (groups && !(node.group === "default" || groups.includes(node.group))) {
      return false;
    }
    return true;
  });
  return (
    <form action={ui.action} className="flex flex-col gap-4" method={ui.method}>
      {showMessages ? <FlowMessages messages={ui.messages} /> : null}
      {pairRows(nodes).map(([first, ...rest]) =>
        rest.length === 0 ? (
          <FlowNode key={nodeKey(first)} node={first} />
        ) : (
          <div className="grid grid-cols-2 gap-4" key={nodeKey(first)}>
            <FlowNode node={first} />
            {rest.map((node) => (
              <FlowNode key={nodeKey(node)} node={node} />
            ))}
          </div>
        )
      )}
    </form>
  );
}

/**
 * Fields that belong on one line, by their trait path.
 *
 * Kratos flattens `name: { first, last }` into two nodes and the form renders
 * whatever it is handed, so a stacked pair is the default rather than a
 * decision. Only adjacent nodes pair, so a schema that separates them keeps
 * them apart.
 */
const SIDE_BY_SIDE = ["traits.name.first", "traits.name.last"];

function pairRows(nodes: UiNode[]): [UiNode, ...UiNode[]][] {
  const rows: [UiNode, ...UiNode[]][] = [];
  for (const node of nodes) {
    const name = (node.attributes as { name?: string }).name;
    const previous = rows.at(-1);
    const pairs =
      previous?.length === 1 &&
      name === SIDE_BY_SIDE[1] &&
      (previous[0].attributes as { name?: string }).name === SIDE_BY_SIDE[0];
    if (pairs && previous) {
      previous.push(node);
    } else {
      rows.push([node]);
    }
  }
  return rows;
}

/** The anti-CSRF token Kratos plants in every browser flow. */
export function csrfTokenFromUi(ui: UiContainer): string {
  for (const node of ui.nodes) {
    if (
      node.attributes.node_type === "input" &&
      node.attributes.name === "csrf_token"
    ) {
      return String(node.attributes.value ?? "");
    }
  }
  return "";
}

/**
 * One field of a flow, for the screens that render their inputs by hand:
 * the value Kratos echoes back, and the messages it attaches to that node
 * rather than to `ui.messages`, which is where schema violations arrive.
 */
export function fieldFromUi(
  ui: UiContainer,
  name: string
): { defaultValue: string; messages: UiText[] } {
  for (const node of ui.nodes) {
    if (
      node.attributes.node_type === "input" &&
      node.attributes.name === name
    ) {
      return {
        defaultValue: String(node.attributes.value ?? ""),
        messages: node.messages,
      };
    }
  }
  return { defaultValue: "", messages: [] };
}

/**
 * Kratos's own notices ("a code has been sent", "choose a credential")
 * narrate steps these screens already describe in their own copy, and the
 * credential-selection one surfaces a screen we deliberately skip. Pass
 * `errorsOnly` wherever the page owns the informational text.
 */
export function FlowMessages({
  messages,
  errorsOnly = false,
}: {
  messages?: UiText[] | undefined;
  errorsOnly?: boolean;
}): ReactNode {
  const visible = errorsOnly
    ? messages?.filter((message) => message.type === "error")
    : messages;
  if (!visible || visible.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      {visible.map((message) => (
        <p className={`text-sm ${messageTone(message)}`} key={message.id}>
          {messageText(message)}
        </p>
      ))}
    </div>
  );
}

function messageTone(message: UiText): string {
  if (message.type === "error") {
    return "text-destructive";
  }
  return "text-muted-foreground";
}

function nodeKey(node: UiNode): string {
  const attributes = node.attributes;
  if (attributes.node_type === "input") {
    // name+value alone collide (e.g. verification renders two `method=code`
    // submits); the label id disambiguates.
    return `${attributes.name}:${String(attributes.value ?? "")}:${node.meta.label?.id ?? ""}`;
  }
  return `${attributes.node_type}:${attributes.id}`;
}

function FlowNode({ node }: { node: UiNode }): ReactNode {
  const attributes = node.attributes;
  switch (attributes.node_type) {
    case "input":
      return <InputNode attributes={attributes} node={node} />;
    case "img":
      // TOTP QR codes arrive as data: URIs; next/image cannot serve those.
      return (
        <img
          alt={node.meta.label?.text ?? "QR code"}
          className="size-40 self-start rounded-md border border-rule bg-white p-2"
          height={attributes.height}
          src={attributes.src}
          width={attributes.width}
        />
      );
    case "text":
      return (
        <div className="flex flex-col gap-1">
          {node.meta.label ? (
            <p className="text-sm">{node.meta.label.text}</p>
          ) : null}
          <p className="font-mono text-sm">{attributes.text.text}</p>
        </div>
      );
    case "a":
      return (
        <a className="text-sm underline" href={attributes.href}>
          {attributes.title.text}
        </a>
      );
    default:
      return null;
  }
}

function InputNode({
  node,
  attributes,
}: {
  node: UiNode;
  attributes: UiNodeInputAttributes;
}): ReactNode {
  const label =
    node.meta.label?.text ?? attributes.label?.text ?? attributes.name;
  switch (attributes.type) {
    case "hidden":
      return (
        <input
          defaultValue={String(attributes.value ?? "")}
          name={attributes.name}
          type="hidden"
        />
      );
    case "submit":
    case "button":
      return (
        <Button
          name={attributes.name}
          type="submit"
          value={String(attributes.value ?? "")}
          variant={node.group === "oidc" ? "outline" : "default"}
        >
          {label}
        </Button>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            defaultChecked={Boolean(attributes.value)}
            id={attributes.name}
            name={attributes.name}
            value="true"
          />
          <Label className="font-normal" htmlFor={attributes.name}>
            {label}
          </Label>
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2">
          <Label htmlFor={attributes.name}>{label}</Label>
          <Input
            autoComplete={attributes.autocomplete}
            defaultValue={String(attributes.value ?? "")}
            disabled={attributes.disabled}
            id={attributes.name}
            name={attributes.name}
            required={attributes.required}
            type={attributes.type}
          />
          <FlowMessages messages={node.messages} />
        </div>
      );
  }
}
