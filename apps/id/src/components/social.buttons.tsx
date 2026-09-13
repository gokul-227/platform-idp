import { Button } from "@aec-craft/ui/components/primitives/button";
import type { UiContainer } from "@ory/client-fetch";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { ENTERPRISE_PROVIDER_IDS } from "@/lib/sso";
import { csrfTokenFromUi } from "./flow.form";
import { GoogleMark } from "./provider-marks/google-mark";
import { MicrosoftMark } from "./provider-marks/microsoft-mark";

/**
 * The social row, shared by login and registration so both screens offer the
 * same providers, order and wording. Kratos labels them "Sign in with" and
 * "Sign up with" per flow; one verb reads better on both.
 *
 * Enterprise connections are reached through the domain-routed SSO screen,
 * never this row.
 */
const PROVIDER_MARKS: Record<
  string,
  ComponentType<SVGProps<SVGSVGElement>> | undefined
> = {
  google: GoogleMark,
  microsoft: MicrosoftMark,
};

const PROVIDER_LABELS: Record<string, string | undefined> = {
  google: "Google",
  microsoft: "Microsoft",
};

function providerIds(ui: UiContainer): string[] {
  const ids: string[] = [];
  for (const node of ui.nodes) {
    const attributes = node.attributes;
    if (
      node.group === "oidc" &&
      attributes.node_type === "input" &&
      attributes.name === "provider" &&
      typeof attributes.value === "string" &&
      !ENTERPRISE_PROVIDER_IDS.includes(attributes.value)
    ) {
      ids.push(attributes.value);
    }
  }
  return ids;
}

export function SocialButtons({ ui }: { ui: UiContainer }): ReactNode {
  const csrfToken = csrfTokenFromUi(ui);
  const providers = providerIds(ui);
  if (providers.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => {
        const Mark = PROVIDER_MARKS[provider];
        const label = PROVIDER_LABELS[provider] ?? provider;
        return (
          <form action={ui.action} key={provider} method="POST">
            <input name="csrf_token" readOnly type="hidden" value={csrfToken} />
            <Button
              className="h-10 w-full gap-3 text-sm"
              name="provider"
              type="submit"
              value={provider}
              variant="outline"
            >
              {Mark ? <Mark data-icon="inline-start" /> : null}
              Continue with {label}
            </Button>
          </form>
        );
      })}
    </div>
  );
}

/** "or" rule between the email form and the social row. */
export function AuthDivider(): ReactNode {
  return (
    <div className="flex items-center gap-3">
      <div className="grow border-rule border-t" />
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
        or
      </span>
      <div className="grow border-rule border-t" />
    </div>
  );
}
