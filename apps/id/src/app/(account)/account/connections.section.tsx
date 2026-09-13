import { Button } from "@aec-craft/ui/components/primitives/button";
import type { UiContainer } from "@ory/client-fetch";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { csrfTokenFromUi } from "@/components/flow.form";
import { GoogleMark } from "@/components/provider-marks/google-mark";
import { MicrosoftMark } from "@/components/provider-marks/microsoft-mark";
import { ENTERPRISE_PROVIDER_IDS } from "@/lib/sso";

const MARKS: Record<
  string,
  ComponentType<SVGProps<SVGSVGElement>> | undefined
> = {
  google: GoogleMark,
  microsoft: MicrosoftMark,
};

interface Connection {
  action: "link" | "unlink";
  provider: string;
}

/**
 * The oidc group of the settings flow as a provider list. Kratos emits one
 * submit node per provider: `link` when unconnected, `unlink` when connected
 * (and omits `unlink` when it would strand the account, so rows degrade to
 * a plain "Connected" with no action).
 */
export function ConnectionsSection({ ui }: { ui: UiContainer }): ReactNode {
  const csrfToken = csrfTokenFromUi(ui);
  const connections: Connection[] = [];
  for (const node of ui.nodes) {
    if (node.group !== "oidc" || node.attributes.node_type !== "input") {
      continue;
    }
    const { name, value } = node.attributes;
    const provider = String(value ?? "");
    if (ENTERPRISE_PROVIDER_IDS.includes(provider)) {
      continue;
    }
    if (name === "link" || name === "unlink") {
      connections.push({ action: name, provider });
    }
  }

  if (connections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No sign-in providers configured.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {connections.map(({ provider, action }) => {
        const Mark = MARKS[provider];
        const isConnected = action === "unlink";
        return (
          <li
            className="flex items-center gap-3 border-rule border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
            key={provider}
          >
            {Mark ? (
              <Mark className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0 rounded-full bg-muted" />
            )}
            <span className="text-sm capitalize">{provider}</span>
            {/* No status text beside the button: "Connected" next to
                "Disconnect" says the same thing twice, and the verb is the
                state either way. */}
            <form action={ui.action} className="ml-auto" method={ui.method}>
              <input
                name="csrf_token"
                readOnly
                type="hidden"
                value={csrfToken}
              />
              <Button
                name={action}
                size="sm"
                type="submit"
                value={provider}
                variant="outline"
              >
                {isConnected ? "Disconnect" : "Connect"}
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
