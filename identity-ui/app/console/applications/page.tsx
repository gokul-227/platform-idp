import type { ReactNode } from "react";

import { hydraAdmin } from "@/adapters/admin";
import { listRegistryApps } from "@/adapters/app-registry";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { PageHeader } from "../page.header";
import { createClientAction } from "../clients/actions";
import { createAppAction } from "./actions";
import { ApplicationsTable, type IntegrationRow } from "./applications-table";

// APPLICATION INTEGRATIONS — the merged view over what used to be two
// separate console pages (Applications, backed by
// integrations/applications/*.yaml + platform/app-registry; Clients, a
// raw Hydra OAuth2 client editor via platform/console-api). Investigated
// whether they're "the same concept": they share one underlying object
// (a Hydra OAuth2 client), but Applications is a strict SUPERSET for a
// SUBSET of clients — the YAML file adds tenant/tags/enable-disable/audit
// history that a plain Hydra client has no field for, and not every real
// client (machine-to-machine, ad-hoc test clients) needs or wants that
// overhead. A full backend merge (one persistence layer for both) would
// mean either forcing every raw client through a YAML file it doesn't
// need, or moving Applications' extra fields into Hydra itself (which has
// no such fields — not possible without forking Hydra). Neither is a safe
// incremental step, so BOTH backends stay exactly as they are; this page
// merges them only at the presentation layer — one table, one search/
// sort/paginate surface, over both sources. `/console/clients` still
// exists as a route (its own detail/edit page for raw clients, and the
// underlying create/rotate/delete actions this page's second form and the
// merged table's "raw client" row actions both call directly) but is no
// longer a separate top-level nav item — see console.nav.tsx.
//
// The registry/YAML persistence itself is kept because it's technically
// required, not out of inertia: platform/app-registry is a real, deployed,
// CI-tested service (.github/workflows/validate.yml) and
// integrations/applications/*.yaml is the only place tenant scoping, tags,
// and enable/disable state are stored — moving that to a database is a
// real schema/backend project, not a console-page change, and is
// documented as future work in docs/04-administration/README.md's
// "Path to unification" section.
//
// The table itself lives in ./applications-table.tsx (a Client Component):
// DataTable's column definitions carry render/sort functions, which React
// cannot serialize across the Server -> Client Component boundary — this
// page tried passing them directly as props before, which threw a real
// live 500 ("Functions cannot be passed directly to Client Components").
export default async function ApplicationsPage(): Promise<ReactNode> {
  const [registryApps, hydraClients] = await Promise.all([
    listRegistryApps(),
    hydraAdmin.listOAuth2Clients({ pageSize: 250 }),
  ]);

  const registryClientIds = new Set(registryApps.map((app) => app.client_id));

  const registryRows: IntegrationRow[] = registryApps.map((app) => ({
    source: "registry",
    client_id: app.client_id,
    client_name: app.client_name,
    redirect_uris: app.redirect_uris,
    scope: app.scope,
    enabled: app.enabled,
    tenant_id: app.tenant_id,
    tags: app.tags,
    authMethod: null,
  }));

  const rawRows: IntegrationRow[] = hydraClients
    .filter((client) => client.client_id && !registryClientIds.has(client.client_id))
    .map((client) => ({
      source: "raw",
      client_id: client.client_id ?? "",
      client_name: client.client_name ?? "",
      redirect_uris: client.redirect_uris ?? [],
      scope: client.scope ?? "",
      enabled: null,
      tenant_id: null,
      tags: [],
      authMethod: client.token_endpoint_auth_method ?? null,
    }));

  const rows = [...registryRows, ...rawRows];

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Every OAuth2 integration on this platform in one place — business applications with a tenant, tags, and enable/disable state (Mealie, Superset, Airflow, ...), and raw machine-to-machine OAuth2 clients with no business context, side by side."
        title="Application Integrations"
      />

      <Card className="gap-4">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">Register application</CardTitle>
            <p className="text-muted-foreground text-xs">
              Creates the OAuth2 client in Hydra and its entry in the application catalog below —
              use this for a real, user-facing app you want scoped to a tenant or tracked with
              tags/enable-disable.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={createAppAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="client_id">Client ID</FieldLabel>
              <Input id="client_id" name="client_id" placeholder="e.g. mealie" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="client_name">Display name</FieldLabel>
              <Input id="client_name" name="client_name" placeholder="e.g. Mealie" required />
            </Field>
            <Field className="sm:col-span-2 lg:col-span-2">
              <FieldLabel htmlFor="redirect_uris">Redirect URIs</FieldLabel>
              <Input
                id="redirect_uris"
                name="redirect_uris"
                placeholder="https://app.example.com/callback, https://..."
                required
              />
              <p className="text-muted-foreground text-xs">Comma-separated, at least one required.</p>
            </Field>
            <Field>
              <FieldLabel htmlFor="scope">OAuth2 scope</FieldLabel>
              <Input defaultValue="openid profile email" id="scope" name="scope" />
            </Field>
            <div className="flex items-end lg:col-start-4">
              <Button className="w-full" type="submit">
                Register application
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <details className="group">
        <summary className="cursor-pointer text-muted-foreground text-sm hover:text-foreground">
          Need a raw OAuth2 client instead? (machine-to-machine, ad-hoc API access, no tenant/tags)
        </summary>
        <Card className="mt-3 gap-4">
          <CardHeader>
            <CardTitle className="text-base">Register raw OAuth2 client</CardTitle>
            <p className="text-muted-foreground text-sm">
              A minimal starting point — grant types, response types, PKCE, JWKS, and token TTLs
              are all editable afterward from the client&apos;s own detail page. No registry entry
              is created; Hydra is the sole source of truth for this client.
            </p>
          </CardHeader>
          <CardContent>
            <form action={createClientAction} className="flex flex-wrap items-end gap-4">
              <Field>
                <FieldLabel htmlFor="raw_client_name">Name</FieldLabel>
                <Input id="raw_client_name" name="client_name" placeholder="e.g. CI pipeline" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="raw_redirect_uris">Redirect URIs (comma-separated)</FieldLabel>
                <Input id="raw_redirect_uris" name="redirect_uris" />
              </Field>
              <Field>
                <FieldLabel htmlFor="raw_scope">Scope</FieldLabel>
                <Input defaultValue="openid profile email" id="raw_scope" name="scope" />
              </Field>
              <Button type="submit">Create</Button>
            </form>
          </CardContent>
        </Card>
      </details>

      <Card className="w-full min-w-0 gap-4">
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length} integration{rows.length === 1 ? "" : "s"}
            <span className="ml-2 font-normal text-muted-foreground text-xs">
              ({registryRows.length} registered app{registryRows.length === 1 ? "" : "s"},{" "}
              {rawRows.length} raw client{rawRows.length === 1 ? "" : "s"})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="w-full min-w-0">
          <ApplicationsTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
