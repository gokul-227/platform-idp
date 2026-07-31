"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import {
  deleteClientAction,
  rotateClientSecretAction,
} from "../clients/actions";
import { deleteAppAction, setAppEnabledAction } from "./actions";

// A merged row shape covering BOTH real sources of an OAuth2 client on
// this platform (see page.tsx for how they're combined): a
// "registry"-source row is backed by integrations/applications/*.yaml +
// platform/app-registry (has enable/disable, tenant, tags — the richer,
// business-application path); a "raw"-source row is a plain Hydra client
// with no registry entry (platform/console-api owns its mutations
// directly — machine-to-machine clients, ad-hoc integrations). This is
// the Application Integrations merge: one list, one search/sort/paginate
// surface, over what used to be two separate console pages
// (/console/applications and /console/clients). Neither backend changed —
// this is a presentation-layer unification, not a data-migration.
export interface IntegrationRow {
  source: "registry" | "raw";
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  scope: string;
  enabled: boolean | null; // null = not applicable (raw clients have no enable/disable concept)
  tenant_id: string | null;
  tags: string[];
  authMethod: string | null; // raw clients only: public/confidential badge
}

// DataTable's `columns` carry render/sort FUNCTIONS, which React cannot
// serialize across the Server -> Client Component boundary — passing them
// as props from an async Server Component page.tsx threw "Functions cannot
// be passed directly to Client Components" (confirmed live: a real 500 on
// this page before this fix). The column definitions must be constructed
// HERE, inside the Client Component boundary, not upstream in the page.
const columns: DataTableColumn<IntegrationRow>[] = [
  {
    id: "name",
    header: "Name",
    sortValue: (row) => row.client_name.toLowerCase(),
    cell: (row) => (
      <Link
        className="font-medium hover:underline"
        href={
          row.source === "registry"
            ? `/console/applications/${encodeURIComponent(row.client_id)}`
            : `/console/clients/${encodeURIComponent(row.client_id)}`
        }
      >
        {row.client_name || "unnamed"}
      </Link>
    ),
  },
  {
    id: "client_id",
    header: "Client ID",
    className: "font-mono text-xs",
    sortValue: (row) => row.client_id,
    cell: (row) => row.client_id,
  },
  {
    id: "source",
    header: "Source",
    sortValue: (row) => row.source,
    cell: (row) => (
      <Badge title={
        row.source === "registry"
          ? "Backed by integrations/applications/*.yaml + platform/app-registry"
          : "A raw Hydra OAuth2 client with no registry entry — platform/console-api owns it directly"
      } variant={row.source === "registry" ? "outline" : "secondary"}>
        {row.source === "registry" ? "registered app" : "raw client"}
      </Badge>
    ),
  },
  {
    id: "status",
    header: "Status",
    sortValue: (row) => (row.enabled === null ? -1 : row.enabled ? 0 : 1),
    cell: (row) => {
      if (row.enabled === null) {
        return (
          <Badge title="Raw Hydra clients have no enable/disable concept — delete to revoke." variant="outline">
            {row.authMethod === "none" ? "public" : "confidential"}
          </Badge>
        );
      }
      return (
        <Badge variant={row.enabled ? "outline" : "secondary"}>
          {row.enabled ? "enabled" : "disabled"}
        </Badge>
      );
    },
  },
  {
    id: "tenant",
    header: "Tenant",
    className: "text-muted-foreground",
    sortValue: (row) => row.tenant_id ?? "",
    cell: (row) => row.tenant_id || <span className="text-muted-foreground">—</span>,
  },
  {
    id: "tags",
    header: "Tags",
    className: "text-muted-foreground",
    cell: (row) => row.tags.join(", ") || <span className="text-muted-foreground">—</span>,
  },
  {
    id: "actions",
    header: "",
    className: "text-right",
    cell: (row) =>
      row.source === "registry" ? (
        <div className="flex items-center justify-end gap-3">
          <form action={setAppEnabledAction}>
            <input name="client_id" type="hidden" value={row.client_id} />
            <input name="enabled" type="hidden" value={row.enabled ? "false" : "true"} />
            <Button size="sm" type="submit" variant={row.enabled ? "outline" : "default"}>
              {row.enabled ? "Disable" : "Enable"}
            </Button>
          </form>
          <Link
            className="text-muted-foreground text-sm hover:text-foreground hover:underline"
            href={`/console/applications/${encodeURIComponent(row.client_id)}/edit`}
          >
            Edit
          </Link>
          <form action={deleteAppAction}>
            <ConfirmSubmitButton
              description="This removes the application from integrations/applications/*.yaml and deletes its Hydra OAuth2 client. Any real application using it will immediately be unable to authenticate. This cannot be undone."
              name="client_id"
              title="Delete this application?"
              value={row.client_id}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3">
          <form action={rotateClientSecretAction}>
            <input name="client_id" type="hidden" value={row.client_id} />
            <ConfirmSubmitButton
              description="The current client secret stops working immediately — any real application using it must be updated with the new one."
              name="client_id"
              title="Rotate this client's secret?"
              value={row.client_id}
              variant="outline"
            >
              Rotate secret
            </ConfirmSubmitButton>
          </form>
          <Link
            className="text-muted-foreground text-sm hover:text-foreground hover:underline"
            href={`/console/clients/${encodeURIComponent(row.client_id)}`}
          >
            Edit
          </Link>
          <form action={deleteClientAction}>
            <ConfirmSubmitButton
              description="This permanently deletes the OAuth2 client from Hydra. Any real application using it will immediately be unable to authenticate. This cannot be undone."
              name="client_id"
              title="Delete this client?"
              value={row.client_id}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      ),
  },
];

export function ApplicationsTable({ rows }: { rows: IntegrationRow[] }): ReactNode {
  return (
    <DataTable
      columns={columns}
      emptyMessage={
        rows.length === 0
          ? "No applications or clients found — are app-registry and console-api reachable?"
          : "No applications or clients match this search."
      }
      getRowKey={(row) => row.client_id}
      rows={rows}
      searchPlaceholder="Search by name, client ID, tenant, or tag"
      searchableText={(row) =>
        [row.client_name, row.client_id, row.tenant_id ?? "", row.tags.join(" "), row.source].join(" ")
      }
    />
  );
}
