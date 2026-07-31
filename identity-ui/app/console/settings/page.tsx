import type { ReactNode } from "react";

import { buildConfigurationBundle } from "@/adapters/config-bundle";
import { Badge } from "@/components/vendor/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { PageHeader } from "../page.header";
import { importConfigurationBundleAction } from "./actions";

// Global Settings, scoped honestly: config/platform.yaml (the repo's own
// documented aspirational settings file — see CLAUDE.md) is NOT read by
// any running service, confirmed by grepping every platform/* package for
// it before building this page. A UI that edited it would look real and
// change nothing — exactly the "fake data" this session has avoided
// everywhere else. So this page covers what IS real: exporting/importing
// the entities this console actually manages (Theme, Flows, Plugins,
// Identity Providers, Roles) as one bundle, through the same Python write
// endpoints every other page already uses. Security/Session/Token/Cookie
// policy, feature flags, and maintenance mode are NOT implemented here —
// see the disclosure card below for why.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const bundle = await buildConfigurationBundle();
  const bundleJson = JSON.stringify(bundle, null, 2);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Configuration export/import across Theme, Flows, Plugins, Identity Providers, and Roles — real current state, applied through the same write endpoints every other console page uses."
        title="Settings"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Administrators</CardTitle>
          <p className="text-muted-foreground text-sm">
            Grant or revoke platform-administrator access for other users.
          </p>
        </CardHeader>
        <CardContent>
          <a
            className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
            href="/auth/console/settings/administrators"
          >
            Manage administrators
          </a>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Export configuration bundle</CardTitle>
          <p className="text-muted-foreground text-sm">
            Current real state of {bundle.flows.length} flow(s), {bundle.plugins.length}{" "}
            config-defined plugin(s), {bundle.identityProviders.length} identity provider(s),
            and {bundle.roles.length} role(s), plus the active theme.
          </p>
        </CardHeader>
        <CardContent>
          <a
            className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
            download="neobim-configuration-bundle.json"
            href={`data:application/json,${encodeURIComponent(bundleJson)}`}
          >
            Download bundle (JSON)
          </a>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Import configuration bundle</CardTitle>
          <p className="text-muted-foreground text-sm">
            Paste a previously exported bundle. &quot;Validate only&quot; checks JSON shape
            without writing anything. Applying calls each section's real create endpoint —
            items that already exist (matching ID) will fail individually and are reported,
            not silently skipped. Flows/plugins are recreated with whatever{" "}
            <code>enabled</code> state was in the bundle (verified live: re-importing an
            enabled flow restores it enabled, not force-disabled) — review the bundle before
            importing into a different environment.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={importConfigurationBundleAction} className="flex flex-col gap-3">
            <textarea
              className="min-h-48 w-full rounded-xl border border-foreground/20 bg-input/50 px-3 py-2 font-mono text-xs"
              name="bundle"
              placeholder="Paste exported bundle JSON here"
            />
            <label className="flex items-center gap-2 text-sm">
              <input name="validate_only" type="checkbox" />
              Validate only (dry run)
            </label>
            <ConfirmSubmitButton
              description="If &quot;Validate only&quot; is checked, this only checks the bundle's JSON shape — nothing is written. If unchecked, this applies real create calls across Theme, Flows, Plugins, Identity Providers, and Roles; items with an ID that already exists will fail individually rather than silently overwrite."
              title="Import this configuration bundle?"
              variant="default"
            >
              Import
            </ConfirmSubmitButton>
          </form>
          {params.import_validated ? (
            <p className="text-sm">✓ Bundle shape is valid.</p>
          ) : null}
          {params.import_success ? (
            <p className="text-sm">✓ Applied all {params.import_success} item(s).</p>
          ) : null}
          {params.import_partial ? (
            <p className="text-sm">
              Applied {params.import_partial} item(s) — some failed, see console-api logs for
              per-item errors.
            </p>
          ) : null}
          {params.import_error ? (
            <p className="text-destructive text-sm">{params.import_error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Not implemented</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            <Badge variant="secondary">Security / Password / Session / Token / Cookie policy</Badge>{" "}
            — Kratos exposes no admin API to read or write its own runtime config; these live
            only in <code>ory/kratos/config/kratos.yaml.tmpl</code> and require a redeploy to
            change. Editing them from a UI without a real apply path would be exactly the kind
            of fake control this session has avoided everywhere else.
          </p>
          <p className="text-muted-foreground">
            <Badge variant="secondary">Feature flags / Maintenance mode</Badge> —{" "}
            <code>config/platform.yaml</code> (which defines these) is not consumed by any
            running service — confirmed by grepping every platform/* package for a read of that
            file; only found in code comments. A toggle here would change nothing real.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
