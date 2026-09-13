"use client";

import { useAdminOrgs } from "@aec-craft/platform-admin-sdk/react";
import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import type { OrgListInput } from "@aec-craft/platform-sdk";
import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { SectionLoading } from "@aec-craft/ui/components/blocks/section";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { BuildingOfficeIcon } from "@aec-craft/ui/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleTable } from "@/components/console.table";
import { QueryError } from "@/components/query.error";
import { PAGE_PARAM, PAGE_SIZE, readTrail } from "@/lib/pagination";

/**
 * Every organization, read through `admin.orgs.list()` as the operator. The
 * name filter and the sort are platform's and ride in the URL, so a filtered view
 * is shareable; `ConsoleTable` keeps them there.
 */

const COLUMNS = [
  { key: "slug", label: "Slug", sortable: true },
  {
    className: "text-muted-foreground",
    filter: { placeholder: "Name…", type: "search" as const },
    key: "name",
    label: "Name",
    sortable: true,
  },
  // `w-0` collapses a column to its content, so the timestamps take only the
  // width they need and the slug and name get the rest.
  {
    className: "w-0 whitespace-nowrap text-muted-foreground",
    key: "createdAt",
    label: "Created",
    sortable: true,
  },
  // `updatedAt` is not in platform's `orgFilters`, so it cannot be ordered.
  {
    className: "w-0 whitespace-nowrap text-muted-foreground",
    label: "Updated",
  },
] as const;

/** The fields platform's `orgFilters` declares sortable; anything else is
 *  dropped rather than sent, because the list refuses an unsortable field. */
const SORTABLE = new Set(["createdAt", "name", "slug"]);

function readSort(value: string | null): string | undefined {
  const [field, direction] = (value ?? "").split(":");
  if (!(field && SORTABLE.has(field))) {
    return;
  }
  return direction === "asc" || direction === "desc"
    ? `${field}:${direction}`
    : undefined;
}

export function OrganizationsTable(): ReactNode {
  const searchParams = useSearchParams();
  const name = searchParams.get("name")?.trim();
  const sort = readSort(searchParams.get("sort"));
  // Offset pagination: the trail holds page numbers, not opaque tokens.
  const page =
    Number(readTrail(searchParams.get(PAGE_PARAM) ?? undefined).at(-1)) || 1;
  const query: OrgListInput = {
    page,
    pageSize: PAGE_SIZE,
    ...(name ? { name: `contains.${name}` } : {}),
    ...(sort ? { sort: [sort] } : {}),
  };
  const orgs = useAdminOrgs(query);

  if (orgs.isPending) {
    return <SectionLoading />;
  }
  if (orgs.error) {
    return (
      <QueryError
        error={orgs.error}
        onRetry={() => void orgs.refetch()}
        subject="the organizations"
      />
    );
  }
  if (page === 1 && !name && orgs.data.items.length === 0) {
    return (
      <EmptyState
        description="No organization exists on this platform yet. Create one for a customer, naming their email as the owner."
        icon={BuildingOfficeIcon}
        title="No organizations"
      />
    );
  }
  const totalPages = orgs.data.totalPages ?? 1;
  return (
    <ConsoleTable
      columns={COLUMNS}
      empty="No organization matches."
      nextToken={page < totalPages ? String(page + 1) : undefined}
    >
      {orgs.data.items.map((org) => (
        <TableRow key={org.id}>
          {/* The slug is the identifier and the link, as an address is on the
              identities table; the name sits beside it and is not clickable. */}
          <TableCell>
            <Link
              className="hover:underline"
              href={`/tenancy/${encodeURIComponent(org.id)}`}
            >
              {org.slug}
            </Link>
          </TableCell>
          <TableCell className="text-muted-foreground">{org.name}</TableCell>
          <TableCell className="w-0 whitespace-nowrap text-muted-foreground">
            {formatDate(new Date(org.createdAt))}
          </TableCell>
          <TableCell className="w-0 whitespace-nowrap text-muted-foreground">
            {formatDate(new Date(org.updatedAt))}
          </TableCell>
        </TableRow>
      ))}
    </ConsoleTable>
  );
}
