"use client";

// Staged, email-first login UX over ONE already-fetched Kratos login flow —
// this is client-side progressive disclosure of what's *visible*, not a
// second server round-trip and not Kratos's native "identifier first" flow
// style (that needs deeper Kratos-version investigation, out of scope here
// — see the PR description). Every node Kratos returned is still part of
// the SAME real <form action={ui.action} method={ui.method}>, so Kratos's
// own CSRF/validation contract is untouched: step 1 shows only the
// identifier field + a client-only "Continue" button (not a submit), and
// "Continue" just reveals more of the already-rendered form rather than
// fetching anything new.
//
// Password stays fully present/submittable in the DOM once revealed (per
// the tech lead: "leave it functional for compatibility, hide it from the
// primary UI until officially removed") — collapsed behind "Use password
// instead" by default, never deleted.

import type { UiNode, UiNodeInputAttributes, UiNodeScriptAttributes, UiText } from "@ory/client-fetch";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/vendor/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { WebAuthnScript, WebAuthnTriggerButton } from "@/components/webauthn-node";
import { isAllowedOidcProvider } from "@/lib/oidc-providers";
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

function messageText(messages: UiText[] | undefined): string | undefined {
  return messages?.[0]?.text;
}

function byGroup(nodes: UiNode[], group: string): UiNode[] {
  return nodes.filter((n) => n.group === group);
}

function HiddenNodes({ nodes }: { nodes: UiNode[] }): ReactNode {
  const hidden = nodes.filter(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && n.attributes.type === "hidden",
  );
  return (
    <>
      {hidden.map((n) => (
        <input key={n.attributes.name} name={n.attributes.name} type="hidden" value={n.attributes.value ?? ""} />
      ))}
    </>
  );
}

// A method's submit/button input node, rendered as a real <Button
// type="submit">. `formNoValidate` matches flow-form.tsx's InputNode
// exactly and for the same reason: this one <form> holds every method's
// fields at once, so a required field from an unrelated, currently-hidden
// method (e.g. password) must never block a different method's submit via
// native HTML5 validation — Kratos's own server-side validation (rendered
// via each node's real `messages`) is the actual source of truth, not the
// browser's `required` attribute.
function MethodSubmitButton({
  node,
  variant,
}: {
  node: UiNode & { attributes: UiNodeInputAttributes };
  variant?: "default" | "outline";
}): ReactNode {
  const attrs = node.attributes;
  return (
    <Button
      disabled={attrs.disabled}
      formNoValidate
      name={attrs.name}
      type="submit"
      value={attrs.value ?? ""}
      variant={variant}
    >
      {node.meta.label?.text ?? attrs.name}
    </Button>
  );
}

function MethodField({ node }: { node: UiNode & { attributes: UiNodeInputAttributes } }): ReactNode {
  const attrs = node.attributes;
  const error = messageText(node.messages);
  const label = node.meta.label?.text;
  return (
    <Field data-invalid={error ? true : undefined}>
      {label ? <FieldLabel htmlFor={attrs.name}>{label}</FieldLabel> : null}
      <Input
        autoComplete={attrs.autocomplete}
        defaultValue={attrs.value ?? ""}
        id={attrs.name}
        name={attrs.name}
        required={attrs.required}
        type={attrs.type}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function OidcButtons({ nodes }: { nodes: UiNode[] }): ReactNode {
  const oidcNodes = byGroup(nodes, "oidc").filter(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && isAllowedOidcProvider(n.attributes.value ?? ""),
  );
  if (oidcNodes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {oidcNodes.map((node) => (
        <MethodSubmitButton key={node.attributes.value} node={node} variant="outline" />
      ))}
    </div>
  );
}

function PasskeyButton({ nodes }: { nodes: UiNode[] }): ReactNode {
  const trigger = byGroup(nodes, "passkey").find(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && Boolean(n.attributes.onclick),
  );
  if (!trigger) return null;
  return (
    <WebAuthnTriggerButton
      disabled={trigger.attributes.disabled}
      label={trigger.meta.label?.text ?? "Sign in with passkey"}
      onclick={trigger.attributes.onclick ?? ""}
    />
  );
}

// Email one-time-code as a LOGIN method (not just registration/recovery
// verification) — only appears once Kratos's own
// selfservice.methods.code.config.passwordless_enabled is true (see
// ory/kratos/config/kratos.yaml.tmpl). Renders nothing if this deployment's
// flow carries no "code"-group nodes — a real, honestly-disclosed gap:
// enabling that config key alone did not surface a `code` node in this
// session's live testing against the running stack (confirmed via curl
// against /self-service/login/browser after restarting Kratos with the new
// config); it likely also needs `selfservice.flows.login.style:
// identifier_first` and/or a per-identity enrolled code credential, both
// out of this pass's scope (see the "don't go down the identifier-first
// path" note above). Written defensively so it activates automatically the
// moment a future Kratos config change actually surfaces these nodes.
function CodeMethod({ nodes }: { nodes: UiNode[] }): ReactNode {
  const codeNodes = byGroup(nodes, "code").filter(isInputAttributes);
  if (codeNodes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {codeNodes.map((node) => {
        const attrs = node.attributes;
        if (attrs.type === "hidden") return null;
        if (attrs.type === "submit" || attrs.type === "button") {
          return <MethodSubmitButton key={attrs.name} node={node as UiNode & { attributes: UiNodeInputAttributes }} />;
        }
        return <MethodField key={attrs.name} node={node as UiNode & { attributes: UiNodeInputAttributes }} />;
      })}
    </div>
  );
}

function PasswordPanel({ nodes }: { nodes: UiNode[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const passwordNodes = byGroup(nodes, "password").filter(isInputAttributes);
  if (passwordNodes.length === 0) return null;
  if (!open) {
    return (
      <button
        className="self-start text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
        onClick={() => setOpen(true)}
        type="button"
      >
        Use password instead
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 border-foreground/10 border-t pt-4">
      {passwordNodes.map((node) => {
        const attrs = node.attributes;
        if (attrs.type === "submit" || attrs.type === "button") {
          return <MethodSubmitButton key={attrs.name} node={node} variant="outline" />;
        }
        return <MethodField key={attrs.name} node={node} />;
      })}
    </div>
  );
}

export function LoginFlow({ flow }: { flow: BrowserFlow }): ReactNode {
  const { ui } = flow;
  const nodes = ui.nodes;
  const formLevelMessages = ui.messages?.filter((m) => m.text) ?? [];
  const identifierNode = nodes.find(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && n.attributes.name === "identifier",
  );
  const scriptNode = nodes.find(isScriptAttributes);
  const hasAnyNodeError = nodes.some((n) => messageText(n.messages) !== undefined);
  const initialIdentifier = identifierNode?.attributes.value ?? "";

  const [identifier, setIdentifier] = useState(initialIdentifier);
  // A resubmission with errors already attached (e.g. "invalid credentials"
  // came back on the identifier/password node, or as a form-level message)
  // means the user already went through step 1 once — start revealed so
  // they land straight back on the erroring section instead of being sent
  // back to step 1.
  const [revealed, setRevealed] = useState(
    formLevelMessages.length > 0 || hasAnyNodeError || initialIdentifier.length > 0,
  );
  const [isAdmin, setIsAdmin] = useState(false);

  // UI EMPHASIS only (see app/api/admin-email-check/route.ts) — re-checks
  // whenever the revealed step is (re)entered for whatever identifier is
  // currently typed. Never blocks or gates anything; a failed/slow check
  // just leaves the normal (non-admin) layout in place.
  useEffect(() => {
    if (!revealed || !identifier) return;
    let cancelled = false;
    fetch("/api/admin-email-check", {
      body: JSON.stringify({ email: identifier }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ isAdmin?: boolean }>) : { isAdmin: false }))
      .then((data) => {
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on `revealed` (re-check whenever step 2 is
    // (re)entered), not on every `identifier` keystroke — the field is
    // disabled once revealed anyway (see below), so identifier can't
    // change again without also flipping `revealed` back to false first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  return (
    <form action={ui.action} className="flex flex-col gap-5" method={ui.method}>
      {formLevelMessages.length > 0 ? (
        <div className="text-destructive text-sm" role="alert">
          {formLevelMessages.map((m) => (
            <p key={m.id}>{m.text}</p>
          ))}
        </div>
      ) : null}
      <HiddenNodes nodes={nodes} />
      {scriptNode ? (
        <WebAuthnScript
          async={scriptNode.attributes.async}
          crossOrigin={scriptNode.attributes.crossorigin}
          integrity={scriptNode.attributes.integrity}
          referrerPolicy={scriptNode.attributes.referrerpolicy}
          src={scriptNode.attributes.src}
        />
      ) : null}
      <Field data-invalid={messageText(identifierNode?.messages) ? true : undefined}>
        <FieldLabel htmlFor="identifier">{identifierNode?.meta.label?.text ?? "Email"}</FieldLabel>
        <Input
          autoComplete="username webauthn"
          className={revealed ? "pointer-events-none cursor-not-allowed opacity-50" : undefined}
          id="identifier"
          name="identifier"
          onChange={(event) => setIdentifier(event.target.value)}
          readOnly={revealed}
          required
          type="text"
          value={identifier}
        />
        {messageText(identifierNode?.messages) ? (
          <FieldError>{messageText(identifierNode?.messages)}</FieldError>
        ) : null}
      </Field>

      {!revealed ? (
        <Button disabled={identifier.trim().length === 0} onClick={() => setRevealed(true)} type="button">
          Continue
        </Button>
      ) : (
        <>
          <button
            className="self-start text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setRevealed(false);
              setIsAdmin(false);
            }}
            type="button"
          >
            Not you? Use a different email
          </button>

          {isAdmin ? (
            <>
              <CodeMethod nodes={nodes} />
              <OidcButtons nodes={nodes} />
              <div className="flex flex-col gap-2 border-foreground/10 border-t pt-4">
                <PasskeyButton nodes={nodes} />
                <PasswordPanel nodes={nodes} />
              </div>
            </>
          ) : (
            <>
              <PasskeyButton nodes={nodes} />
              <OidcButtons nodes={nodes} />
              <PasswordPanel nodes={nodes} />
            </>
          )}
        </>
      )}
    </form>
  );
}
