// Generic Kratos flow renderer — walks `ui.nodes[]` and renders a plain
// <form> that posts straight back to Kratos at `ui.action`. Kratos owns
// CSRF, validation, and redirects; this component only renders. Pattern
// confirmed against .reference/platform-ory-id-spike/apps/id/src/components/
// flow.form.tsx (read-only reference, not copied verbatim — this version
// uses @aec-craft/ui primitives instead of that reference's own component
// library, since reusing NeoBIM's design system rather than inventing
// another one is this app's whole reason to exist).
//
// `type: "input"`, `type: "img"`, `type: "text"`, and `type: "script"` nodes
// are all handled. `script` nodes and `onclick`-carrying input nodes are
// Kratos's real WebAuthn/passkey integration contract (see
// components/webauthn-node.tsx). `img`/`text` nodes are real too — TOTP
// enrollment's QR code and manual secret key, and lookup_secret's recovery
// codes, all arrive this way; an earlier version of this file silently
// dropped both node types entirely (no case matched them, `InputNode`
// returned null), so TOTP enrollment had no QR code and no way to see the
// secret except via the raw API — confirmed live, fixed. `a`/`div` nodes
// still don't appear in practice — Kratos's oidc method IS enabled, with 5
// real providers configured (ory/kratos/config/kratos.yaml.tmpl); its
// "Sign in with <provider>" buttons arrive as ordinary `input type=submit`
// nodes in the "oidc" group, same as every other method, not as `a`/`div`
// nodes. (A stale version of this comment claimed no social-login buttons
// were enabled at all — that was wrong; fixed here. See
// lib/oidc-providers.ts for why only 2 of the 5 configured providers are
// actually rendered.)
//
// Components come from components/vendor/ui/, not a live @aec-craft/ui
// import — Turbopack's resolution of that package's .tsx subpath exports is
// unreliable via a `file:` dependency even with `externalDir: true` set
// (confirmed live: the exact same failure applications/neobim/neobim-ui's Docker
// build hit). The CSS (app/globals.css) is a synced local copy, same
// treatment — see components/vendor/ui/button.tsx for the full explanation.

import { RecoveryCodesActions } from "@/components/recovery-codes-actions";
import { isAllowedOidcProvider } from "@/lib/oidc-providers";
import { Button } from "@/components/vendor/ui/button";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldError, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { WebAuthnScript, WebAuthnTriggerButton } from "@/components/webauthn-node";
import type {
  UiNode,
  UiNodeImageAttributes,
  UiNodeInputAttributes,
  UiNodeScriptAttributes,
  UiNodeTextAttributes,
  UiText,
} from "@ory/client-fetch";
import type { ReactNode } from "react";

import type { BrowserFlow } from "@/types/flow";

function isInputAttributes(
  node: UiNode,
): node is UiNode & { attributes: UiNodeInputAttributes } {
  return node.attributes.node_type === "input";
}

function isScriptAttributes(
  node: UiNode,
): node is UiNode & { attributes: UiNodeScriptAttributes } {
  return node.attributes.node_type === "script";
}

function isImageAttributes(
  node: UiNode,
): node is UiNode & { attributes: UiNodeImageAttributes } {
  return node.attributes.node_type === "img";
}

function isTextAttributes(
  node: UiNode,
): node is UiNode & { attributes: UiNodeTextAttributes } {
  return node.attributes.node_type === "text";
}

function messageText(messages: UiText[] | undefined): string | undefined {
  return messages?.[0]?.text;
}

function InputNode({ node }: { node: UiNode }): ReactNode {
  if (!isInputAttributes(node)) return null;
  const attrs = node.attributes;

  // Kratos represents "submit this flow" and hidden CSRF/flow-id fields as
  // input nodes too — render submits as buttons, hidden fields as-is (no
  // label/error chrome needed for either).
  if (attrs.type === "hidden") {
    return (
      <input
        key={attrs.name}
        type="hidden"
        name={attrs.name}
        value={attrs.value ?? ""}
      />
    );
  }

  if (attrs.type === "submit" || attrs.type === "button") {
    // WebAuthn/passkey trigger buttons carry an `onclick` calling Kratos's
    // own webauthn.js — they run the real browser ceremony instead of
    // submitting the form directly (see components/webauthn-node.tsx).
    if (attrs.onclick) {
      return (
        <WebAuthnTriggerButton
          disabled={attrs.disabled}
          key={attrs.name}
          label={node.meta.label?.text ?? attrs.name}
          onclick={attrs.onclick}
        />
      );
    }
    // Real destructive/high-consequence actions Kratos exposes as a plain
    // submit button with no confirmation step of its own — regenerating
    // recovery codes invalidates every existing one, and unlinking TOTP
    // removes a second factor. Both previously submitted immediately on
    // click; gate them behind a real confirmation instead.
    const CONFIRM_COPY: Record<string, { description: string; title: string }> = {
      lookup_secret_regenerate: {
        description:
          "This invalidates every recovery code you currently have. Save the new codes somewhere safe before leaving this page — they are shown only once.",
        title: "Generate new backup recovery codes?",
      },
      totp_unlink: {
        description:
          "You will no longer be able to sign in with codes from your authenticator app. Make sure you have another second factor or recovery method available first.",
        title: "Remove authenticator app?",
      },
    };
    const confirmCopy = attrs.name ? CONFIRM_COPY[attrs.name] : undefined;
    if (confirmCopy) {
      return (
        <ConfirmSubmitButton
          description={confirmCopy.description}
          disabled={attrs.disabled}
          key={attrs.name}
          name={attrs.name}
          title={confirmCopy.title}
          value={attrs.value ?? ""}
          variant="outline"
        >
          {node.meta.label?.text ?? attrs.name}
        </ConfirmSubmitButton>
      );
    }
    return (
      <Button
        key={attrs.name}
        type="submit"
        name={attrs.name}
        value={attrs.value ?? ""}
        disabled={attrs.disabled}
        // All of a flow's methods (password, oidc, webauthn, ...) render
        // into one shared <form> (FlowForm doesn't filter by group unless
        // a page explicitly passes one). A required identifier/password
        // input from a DIFFERENT method's group otherwise blocks native
        // HTML5 validation on ANY submit click in the form — confirmed
        // live: clicking "Sign in with Google" with the password fields
        // empty fired zero network requests, because
        // form.checkValidity() silently failed on the unrelated required
        // identifier field. Kratos's own server-side flow validation
        // (already rendered via each node's real `messages`) is the
        // actual source of truth here, not the browser's HTML5 required
        // attribute, which has no concept of "this button belongs to a
        // different method."
        formNoValidate
      >
        {node.meta.label?.text ?? attrs.name}
      </Button>
    );
  }

  const error = messageText(node.messages);
  const label = node.meta.label?.text;

  return (
    <Field key={attrs.name} data-invalid={error ? true : undefined}>
      {label ? <FieldLabel htmlFor={attrs.name}>{label}</FieldLabel> : null}
      <Input
        id={attrs.name}
        name={attrs.name}
        type={attrs.type}
        defaultValue={attrs.value ?? ""}
        required={attrs.required}
        disabled={attrs.disabled}
        autoComplete={attrs.autocomplete}
        pattern={attrs.pattern}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function ScriptNode({ node }: { node: UiNode }): ReactNode {
  if (!isScriptAttributes(node)) return null;
  const attrs = node.attributes;
  return (
    <WebAuthnScript
      async={attrs.async}
      crossOrigin={attrs.crossorigin}
      integrity={attrs.integrity}
      referrerPolicy={attrs.referrerpolicy}
      src={attrs.src}
    />
  );
}

// Kratos's real TOTP enrollment includes an `img` node (the QR code, as a
// data: URI) alongside the `totp_secret_key` text node and the code input —
// neither `img` nor `text` node types were ever rendered here, so the QR
// code and the manual secret were both silently dropped, leaving only the
// bare code-entry field. Confirmed live: a real settings flow response's
// `totp` group includes exactly these three node types.
function ImageNode({ node }: { node: UiNode }): ReactNode {
  if (!isImageAttributes(node)) return null;
  const attrs = node.attributes;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a Kratos-served
    // data: URI, not an optimizable remote asset.
    <img alt="" height={attrs.height} key={attrs.id} src={attrs.src} width={attrs.width} />
  );
}

function TextNode({ node }: { node: UiNode }): ReactNode {
  if (!isTextAttributes(node)) return null;
  const attrs = node.attributes;
  const label = node.meta.label?.text;
  // lookup_secret's recovery codes arrive as a list in `text.context.secrets`
  // — each entry's real code is at `.text` (confirmed live; NOT `.code`, an
  // incorrect first guess this replaces) — totp_secret_key's real secret
  // arrives as the flat `text.text` string. Render whichever shape this
  // node actually carries.
  const context = attrs.text.context as { secrets?: { text: string }[] } | undefined;
  const codes = context?.secrets?.map((s) => s.text);

  return (
    <Field key={attrs.id}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {codes ? (
        <>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <RecoveryCodesActions codes={codes} />
        </>
      ) : (
        <p className="select-all break-all font-mono text-sm">{attrs.text.text}</p>
      )}
    </Field>
  );
}

function FlowNode({ node, index }: { node: UiNode; index: number }): ReactNode {
  if (isScriptAttributes(node)) {
    return <ScriptNode key={`script-${index}`} node={node} />;
  }
  if (isImageAttributes(node)) {
    return <ImageNode key={`img-${index}`} node={node} />;
  }
  if (isTextAttributes(node)) {
    return <TextNode key={`text-${index}`} node={node} />;
  }
  return <InputNode key={`${node.attributes.node_type}-${index}`} node={node} />;
}

export function FlowForm({
  flow,
  groups,
  excludeNamePrefixes,
}: {
  flow: BrowserFlow;
  /**
   * Render only nodes from these Kratos node groups (e.g. ["profile"],
   * ["totp"]) — lets one flow's response power several separately-submitted
   * Cards, matching .reference/platform-ory-id-spike/apps/id's settings
   * page (one <FlowForm groups={[...]}> per Card). "default" (csrf_token,
   * hidden nodes with no real group) is always included regardless, since
   * every one of these smaller forms still needs Kratos's CSRF token to
   * validate. Omit entirely to render every node flat (login/registration/
   * recovery/verification — flows with exactly one method group in play).
   */
  groups?: string[];
  /**
   * Drop input nodes whose `attrs.name` starts with any of these prefixes —
   * e.g. registration/page.tsx uses this to cut the registration form down
   * to email + first/last name, hiding the rest of enterprise-user.schema.json's
   * optional trait fields (username/phone/avatar/locale/timezone/
   * organization.-prefixed, consent.-prefixed, status, metadata). Unlike
   * profile-section.tsx's
   * EXCLUDED_PREFIXES, these are simply not submitted at all (no hidden-
   * input passthrough) — there's no existing value to preserve on a brand
   * new registration, so dropping them outright is fine; Kratos treats
   * every one of these traits as optional per the schema.
   */
  excludeNamePrefixes?: string[];
}): ReactNode {
  const { ui } = flow;
  const formLevelMessages = ui.messages?.filter((m) => m.text) ?? [];
  let nodes = groups
    ? ui.nodes.filter(
        (node) => node.group === "default" || groups.includes(node.group),
      )
    : ui.nodes;
  // Only Google/Microsoft are ever rendered — see lib/oidc-providers.ts.
  // The other 3 configured providers' nodes are filtered out here, not
  // deleted from Kratos config.
  nodes = nodes.filter((node) => {
    if (node.group !== "oidc" || !isInputAttributes(node)) return true;
    return isAllowedOidcProvider(node.attributes.value ?? "");
  });
  if (excludeNamePrefixes && excludeNamePrefixes.length > 0) {
    nodes = nodes.filter((node) => {
      if (!isInputAttributes(node)) return true;
      const name = node.attributes.name;
      return !excludeNamePrefixes.some((prefix) => name.startsWith(prefix));
    });
  }

  return (
    <form
      action={ui.action}
      method={ui.method}
      className="flex flex-col gap-4"
    >
      {formLevelMessages.length > 0 ? (
        <div className="text-destructive text-sm" role="alert">
          {formLevelMessages.map((m) => (
            <p key={m.id}>{m.text}</p>
          ))}
        </div>
      ) : null}
      {nodes.map((node, i) => (
        // Kratos node names aren't guaranteed unique across groups (e.g. a
        // hidden csrf_token can appear per-group) — index as a last-resort
        // key alongside the name is fine since node order is stable within
        // one rendered flow response.
        <FlowNode index={i} key={`node-${i}`} node={node} />
      ))}
    </form>
  );
}
