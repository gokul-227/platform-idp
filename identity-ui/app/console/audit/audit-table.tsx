"use client";

import type { ReactNode } from "react";

import type { AuditEvent } from "@/adapters/audit-service";
import { Badge } from "@/components/vendor/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/data-table";

function formatDate(value: string): string {
  return value.replace("T", " ").slice(0, 19) + " UTC";
}

// DataTable's `columns` carry render/sort FUNCTIONS, which React cannot
// serialize across the Server -> Client Component boundary — passing them
// as props from an async Server Component page.tsx threw a real live 500
// ("Functions cannot be passed directly to Client Components"). The column
// definitions must be constructed HERE, inside the Client Component
// boundary; `events` (plain data) is the only thing that crosses it.
const columns: DataTableColumn<AuditEvent>[] = [
  {
    id: "created_at",
    header: "Time",
    className: "text-muted-foreground",
    sortValue: (event) => event.created_at,
    cell: (event) => formatDate(event.created_at),
  },
  {
    id: "action",
    header: "Action",
    sortValue: (event) => event.action,
    cell: (event) => <Badge variant="outline">{event.action}</Badge>,
  },
  {
    id: "resource_type",
    header: "Resource type",
    className: "text-muted-foreground",
    sortValue: (event) => event.resource_type,
    cell: (event) => event.resource_type,
  },
  {
    id: "resource_id",
    header: "Resource ID",
    className: "font-mono text-muted-foreground text-xs",
    sortValue: (event) => event.resource_id ?? "",
    cell: (event) => event.resource_id || <span className="text-muted-foreground">—</span>,
  },
  {
    id: "metadata",
    header: "Details",
    cell: (event) => {
      const hasMetadata = Object.keys(event.metadata_json ?? {}).length > 0;
      if (!hasMetadata) return <span className="text-muted-foreground">—</span>;
      return (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            View
          </summary>
          <pre className="mt-2 max-w-md overflow-x-auto rounded-2xl border border-foreground/10 bg-input/30 p-3 font-mono text-xs">
            {JSON.stringify(event.metadata_json, null, 2)}
          </pre>
        </details>
      );
    },
  },
];

export function AuditTable({
  events,
  emptyMessage,
}: {
  events: AuditEvent[];
  emptyMessage: string;
}): ReactNode {
  return (
    <DataTable
      columns={columns}
      emptyMessage={emptyMessage}
      getRowKey={(event) => event.id}
      rows={events}
      searchPlaceholder="Search by action, resource type, or resource ID"
      searchableText={(event) =>
        [event.action, event.resource_type, event.resource_id ?? ""].join(" ")
      }
    />
  );
}
