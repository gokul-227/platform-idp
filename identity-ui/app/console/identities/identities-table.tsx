"use client";

import type { Identity } from "@ory/client-fetch";
import Link from "next/link";
import type { ReactNode } from "react";

import { displayName, formatDate, identityTraits } from "@/lib/identity-format";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { deleteIdentityAction, setIdentityEnabledAction } from "./actions";

// DataTable's `columns` carry render/sort FUNCTIONS, which React cannot
// serialize across the Server -> Client Component boundary — passing them
// as props from an async Server Component page.tsx threw a real live 500
// ("Functions cannot be passed directly to Client Components"). The column
// definitions must be constructed HERE, inside the Client Component
// boundary; `identities` (plain data) is the only thing that crosses it.
const columns: DataTableColumn<Identity>[] = [
  {
    id: "email",
    header: "Email",
    sortValue: (identity) => (identityTraits(identity).email ?? identity.id).toLowerCase(),
    cell: (identity) => (
      <Link className="font-medium hover:underline" href={`/console/identities/${identity.id}`}>
        {identityTraits(identity).email ?? identity.id}
      </Link>
    ),
  },
  {
    id: "name",
    header: "Name",
    className: "text-muted-foreground",
    sortValue: (identity) => displayName(identity).toLowerCase(),
    cell: (identity) => displayName(identity),
  },
  {
    id: "state",
    header: "State",
    sortValue: (identity) => (identity.state === "active" ? 0 : 1),
    cell: (identity) => (
      <Badge variant={identity.state === "active" ? "outline" : "secondary"}>
        {identity.state ?? "unknown"}
      </Badge>
    ),
  },
  {
    id: "verified",
    header: "Verified",
    className: "text-muted-foreground",
    sortValue: (identity) =>
      (identity.verifiable_addresses ?? []).some((a) => a.verified) ? 0 : 1,
    cell: (identity) =>
      (identity.verifiable_addresses ?? []).some((a) => a.verified) ? "verified" : "unverified",
  },
  {
    id: "created",
    header: "Created",
    className: "text-muted-foreground",
    sortValue: (identity) => (identity.created_at ? identity.created_at.getTime() : 0),
    cell: (identity) => formatDate(identity.created_at),
  },
  {
    id: "actions",
    header: "",
    className: "text-right",
    cell: (identity) => {
      const isActive = identity.state === "active";
      return (
        <div className="flex items-center justify-end gap-2">
          <form action={setIdentityEnabledAction}>
            <input name="id" type="hidden" value={identity.id} />
            <input name="enabled" type="hidden" value={isActive ? "false" : "true"} />
            <Button size="sm" type="submit" variant="outline">
              {isActive ? "Disable" : "Enable"}
            </Button>
          </form>
          <form action={deleteIdentityAction}>
            <ConfirmSubmitButton
              description="This permanently deletes the Kratos identity — all credentials, sessions, and traits. This cannot be undone."
              name="id"
              title="Delete this identity?"
              value={identity.id}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      );
    },
  },
];

export function IdentitiesTable({
  identities,
  emptyMessage,
}: {
  identities: Identity[];
  emptyMessage: string;
}): ReactNode {
  return (
    <DataTable
      columns={columns}
      emptyMessage={emptyMessage}
      getRowKey={(identity) => identity.id}
      rows={identities}
      searchPlaceholder="Search by email or name"
      searchableText={(identity) =>
        [identityTraits(identity).email ?? "", displayName(identity)].join(" ")
      }
    />
  );
}
