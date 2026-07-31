import type { ReactNode } from "react";

import { listIdentityProviders, type IdentityProvider } from "@/adapters/identity-providers";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { getEnv } from "@/config/env";
import { PageHeader } from "../page.header";
import { setProviderEnabledAction } from "./actions";

// Kratos's redirect URI is a fixed, documented convention
// (self-service/methods/oidc/callback/<provider>), not per-provider
// config — real and safe to compute/display, not fabricated. This is
// exactly the value an admin needs to paste into a new OAuth app's
// "Authorized redirect URI" field on the provider's own developer console.
function redirectUri(providerId: string): string {
  return `${getEnv().publicBaseUrl}/.ory/kratos/public/self-service/methods/oidc/callback/${providerId}`;
}

const PROVIDER_DOCS: Record<string, string> = {
  apple: "https://www.ory.sh/docs/kratos/social-signin/apple",
  github: "https://www.ory.sh/docs/kratos/social-signin/github",
  gitlab: "https://www.ory.sh/docs/kratos/social-signin/gitlab",
  google: "https://www.ory.sh/docs/kratos/social-signin/google",
  microsoft: "https://www.ory.sh/docs/kratos/social-signin/microsoft",
};

function providerCard(provider: IdentityProvider): ReactNode {
  const label = provider.label ?? provider.id;
  const hasMetadata = provider.scope !== undefined;
  return (
    <Card className="gap-4" key={provider.id}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-foreground/10 font-medium text-sm">
              {label.slice(0, 1).toUpperCase()}
            </div>
            <CardTitle className="text-base">{label}</CardTitle>
          </div>
          <Badge variant={provider.enabled ? "outline" : "secondary"}>
            {provider.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {hasMetadata ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Client configured</dt>
            <dd>{provider.client_id_configured ? "Yes" : "No — set the env var and restart"}</dd>
            <dt className="text-muted-foreground">Scopes</dt>
            <dd className="font-mono">{provider.scope?.join(", ") || "(none)"}</dd>
            <dt className="text-muted-foreground">Redirect URI</dt>
            <dd className="select-all break-all font-mono">{redirectUri(provider.id)}</dd>
          </dl>
        ) : (
          <p className="text-muted-foreground text-xs">
            Real client/scope details aren&apos;t available — Kratos&apos;s rendered config isn&apos;t
            reachable from this page right now (not a broken provider, just missing metadata).
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {PROVIDER_DOCS[provider.id] ? (
            <a
              className="text-muted-foreground text-xs underline hover:text-foreground"
              href={PROVIDER_DOCS[provider.id]}
              rel="noreferrer"
              target="_blank"
            >
              Setup documentation
            </a>
          ) : (
            <span />
          )}
          <form action={setProviderEnabledAction}>
            <input name="provider_id" type="hidden" value={provider.id} />
            <input name="enabled" type="hidden" value={provider.enabled ? "false" : "true"} />
            <Button size="sm" type="submit" variant={provider.enabled ? "outline" : "default"}>
              {provider.enabled ? "Disable" : "Enable"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

// Toggling here writes config/identity-providers.yaml through
// platform/console-api — it does NOT restart Kratos. Kratos's OSS edition
// has no runtime config-reload API, so an operator applies a change with
// `make restart` (reruns config-render + the identity-providers-render
// filtering step before Kratos starts back up). Credentials
// (client_id/secret) for these 5 providers are unchanged from
// ory/kratos/config/kratos.yaml.tmpl — this page only controls which of
// the already-configured providers actually reach Kratos. There is no
// "Test connection" action: Kratos OSS has no admin API to dry-run an
// OIDC provider outside a real browser self-service flow, so the only
// genuine test is actually signing in with it — see the Connected
// Accounts section of any account's own Settings page.
export default async function IdentityProvidersPage(): Promise<ReactNode> {
  const providers = await listIdentityProviders();

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Kratos social login providers. Enable/Disable calls platform/console-api and writes config/identity-providers.yaml — applying the change requires an operator to run `make restart` (Kratos has no live config-reload API)."
        title="Identity Providers"
      />
      {providers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No providers found — is console-api reachable?
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map(providerCard)}
        </div>
      )}
    </div>
  );
}
