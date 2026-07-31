import type { UiNode, UiNodeInputAttributes } from "@ory/client-fetch";
import type { ReactNode } from "react";

import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { isAllowedOidcProvider } from "@/lib/oidc-providers";
import type { BrowserFlow } from "@/types/flow";

// Real Kratos oidc-group settings nodes: `name: "link"` for an unlinked
// provider, `name: "unlink"` for one already connected to this identity —
// the node's own `attributes.value`/`meta.label.context.provider` is the
// provider id (google/github/gitlab/microsoft/apple). Kratos does not
// return "last used" for a linked provider (no such field exists in the
// settings flow's oidc node) — shown honestly as "connected" only, not
// fabricated. Renders its own <form> (mirroring components/flow-form.tsx's
// action/method/csrf-token handling) rather than reusing FlowForm's fully
// generic node renderer, since the provider-card layout needs custom
// per-node handling FlowForm has no hook for.
function isInputAttributes(
  node: UiNode,
): node is UiNode & { attributes: UiNodeInputAttributes } {
  return node.attributes.node_type === "input";
}

const PROVIDER_LABELS: Record<string, string> = {
  apple: "Apple",
  github: "GitHub",
  gitlab: "GitLab",
  google: "Google",
  microsoft: "Microsoft",
};

function providerInitial(provider: string): string {
  return provider.slice(0, 1).toUpperCase();
}

export function ConnectedAccountsSection({ flow }: { flow: BrowserFlow }): ReactNode {
  const nodes = flow.ui.nodes.filter((n) => n.group === "default" || n.group === "oidc");
  const hiddenNodes = nodes.filter(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      isInputAttributes(n) && n.attributes.type === "hidden",
  );
  // Only Google/Microsoft are ever offered here — see lib/oidc-providers.ts.
  // Kratos config still has all 5 providers; this is a UI-only hide (an
  // identity already linked to a hidden provider keeps that link, it's
  // just not shown/manageable from this page).
  const oidcNodes = nodes.filter(
    (n): n is UiNode & { attributes: UiNodeInputAttributes } =>
      n.group === "oidc" && isInputAttributes(n) && isAllowedOidcProvider(n.attributes.value ?? ""),
  );

  if (oidcNodes.length === 0) {
    return <p className="text-muted-foreground text-sm">No social login providers are configured.</p>;
  }

  return (
    <form action={flow.ui.action} className="flex flex-col gap-3" method={flow.ui.method}>
      {hiddenNodes.map((node) => (
        <input
          key={node.attributes.name}
          name={node.attributes.name}
          type="hidden"
          value={node.attributes.value ?? ""}
        />
      ))}
      {oidcNodes.map((node) => {
        const provider =
          (node.meta.label?.context as { provider?: string } | undefined)?.provider ??
          node.attributes.value ??
          "";
        const isLinked = node.attributes.name === "unlink";
        return (
          <div
            className="flex items-center justify-between gap-4 rounded-3xl border border-foreground/20 bg-input/50 px-4 py-3"
            key={provider}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-foreground/10 font-medium text-sm">
                {providerInitial(provider)}
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-sm">{PROVIDER_LABELS[provider] ?? provider}</span>
                <Badge variant={isLinked ? "outline" : "secondary"}>
                  {isLinked ? "Connected" : "Not connected"}
                </Badge>
              </div>
            </div>
            {isLinked ? (
              <ConfirmSubmitButton
                description={`Sign-in with ${PROVIDER_LABELS[provider] ?? provider} will no longer work for this account. Make sure you have another way to sign in first.`}
                name="unlink"
                title={`Disconnect ${PROVIDER_LABELS[provider] ?? provider}?`}
                value={provider}
                variant="outline"
              >
                Disconnect
              </ConfirmSubmitButton>
            ) : (
              <Button name="link" size="sm" type="submit" value={provider} variant="outline">
                Connect
              </Button>
            )}
          </div>
        );
      })}
    </form>
  );
}
