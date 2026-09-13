"use client";

import {
  auditResourceLabel,
  auditStatusLabel,
} from "@aec-craft/platform-id-contracts/audit/audit.labels";
import {
  formatDay,
  formatTimeUtc,
} from "@aec-craft/platform-id-contracts/common/format";
import type { AuditEvent } from "@aec-craft/platform-id-db/audit";
import {
  DataTable,
  type TableQuery,
} from "@aec-craft/ui/components/blocks/data-table";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@aec-craft/ui/components/primitives/pagination";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { CaretRightIcon } from "@aec-craft/ui/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  applicationCellLabel,
  type FilterOption,
  itemLabel,
  verbLabel,
} from "@/lib/audit.event";
import { AUDIT_STATUS_BADGE, UNKNOWN_STATUS } from "@/lib/status.badge";

/**
 * The audit list: the shared `@aec-craft/ui` DataTable wired with this page's
 * columns, plus the pagination and CSV export that sit around it.
 */

export type AuditRowEvent = AuditEvent & { actorLabel: string };

type SortableKey =
  | "actor"
  | "application"
  | "createdAt"
  | "item"
  | "resource"
  | "status"
  | "verb";

function sortValue(event: AuditRowEvent, key: SortableKey): string {
  switch (key) {
    case "createdAt":
      return event.createdAt.toISOString();
    case "actor":
      return event.actorLabel;
    case "resource":
      return auditResourceLabel(event.resource);
    case "verb":
      return verbLabel(event.verb);
    case "item":
      return itemLabel(event);
    case "application":
      return applicationCellLabel(event);
    case "status":
      return auditStatusLabel(event.status);
    default:
      return "";
  }
}

// A summary to scan; the forensic detail is one click away. Ordered as the
// sentence reads — who, through what, did what to which thing, and how it went —
// rather than interleaving the actor with the act.
//
// Resource and Action stay two columns because they are two filters, and a merged
// one could only answer half of "every deletion" and "everything about
// applications". `Subject` is the thing acted on: its label when it has one and
// its id when it does not, which is why it is not called ID.
function buildColumns(options: {
  applications: FilterOption[];
  resources: FilterOption[];
  verbs: FilterOption[];
}) {
  return [
    {
      key: "createdAt",
      label: "Date & time",
      sortable: true,
      className: "text-muted-foreground",
    },
    {
      key: "actor",
      label: "User",
      sortable: true,
      filter: { type: "search", placeholder: "name or email" } as const,
    },
    {
      key: "application",
      label: "Application",
      sortable: true,
      className: "text-muted-foreground",
      filter: {
        type: "select",
        searchable: true,
        options: options.applications,
      } as const,
    },
    {
      key: "resource",
      label: "Resource",
      sortable: true,
      filter: { type: "select", options: options.resources } as const,
    },
    {
      key: "verb",
      label: "Action",
      sortable: true,
      filter: { type: "select", options: options.verbs } as const,
    },
    {
      key: "item",
      label: "Target",
      sortable: true,
      className: "text-muted-foreground",
      filter: { type: "search", placeholder: "Name or id" } as const,
    },
    {
      key: "status",
      label: "Result",
      sortable: true,
      filter: {
        type: "select",
        options: [
          { label: auditStatusLabel("success"), value: "success" },
          { label: auditStatusLabel("failure"), value: "failure" },
          { label: auditStatusLabel("denied"), value: "denied" },
        ],
      } as const,
    },
  ] as const;
}

/** Two lines — a scannable date and an exact time — rather than one long
 *  ISO-ish string competing for width with every other column. */
function TimestampCell({ value }: { value: Date }): ReactNode {
  const date = formatDay(value);
  const time = formatTimeUtc(value);
  return (
    <span className="flex flex-col gap-0.5 py-1">
      <span>{date}</span>
      <span className="text-muted-foreground text-xs">{time}</span>
    </span>
  );
}

function Row({ event }: { event: AuditRowEvent }): ReactNode {
  const router = useRouter();
  const open = (): void => router.push(`/audit/${event.id}`);
  return (
    <TableRow
      className="cursor-pointer"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <TableCell className="text-muted-foreground">
        <TimestampCell value={event.createdAt} />
      </TableCell>
      <TableCell className="max-w-40">
        {/* Name over address, as a member row reads: one line collapsed to
            whichever was set, so two people with the same display name were
            indistinguishable. */}
        <span className="flex flex-col">
          <span className="truncate">{event.actorLabel}</span>
          {event.actorName && event.actorEmail ? (
            <span className="truncate text-muted-foreground text-xs">
              {event.actorEmail}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="max-w-36 truncate text-muted-foreground">
        {applicationCellLabel(event)}
      </TableCell>
      <TableCell>{auditResourceLabel(event.resource)}</TableCell>
      <TableCell>{verbLabel(event.verb)}</TableCell>
      <TableCell className="max-w-36 truncate text-muted-foreground">
        {itemLabel(event)}
      </TableCell>
      <TableCell>
        <span className="flex items-center justify-between gap-3">
          <Badge {...(AUDIT_STATUS_BADGE[event.status] ?? UNKNOWN_STATUS)}>
            {auditStatusLabel(event.status)}
          </Badge>
          <CaretRightIcon className="size-3 shrink-0 text-muted-foreground/40" />
        </span>
      </TableCell>
    </TableRow>
  );
}

// The column filters' query params, the same names the toolbar form and the
// breakdown links use, so every entry point produces one URL shape.
const FILTER_COLUMN_KEYS = [
  "resource",
  "verb",
  "actor",
  "item",
  "application",
  "status",
] as const;

export function AuditTable({
  applications,
  empty,
  events,
  resources,
  title,
  toolbar,
  verbs,
}: {
  applications: FilterOption[];
  empty: ReactNode;
  events: AuditRowEvent[];
  resources: FilterOption[];
  verbs: FilterOption[];
  /** Passed through to the DataTable's own title/toolbar slots, so the count
   *  and export action sit inside the table's chrome. */
  title?: ReactNode;
  toolbar?: ReactNode;
}): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const columns = useMemo(
    () => buildColumns({ applications, resources, verbs }),
    [applications, resources, verbs]
  );

  const filters: Record<string, string> = {};
  for (const key of FILTER_COLUMN_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      filters[key] = value;
    }
  }
  const [sort, setSort] = useState<TableQuery["sort"]>();
  const query: TableQuery = { filters, sort };

  // A column filter changes the URL (server refetch, same as the toolbar);
  // sort stays client-side — the current page's rows, reordered.
  function onQueryChange(next: TableQuery): void {
    if (next.filters !== filters) {
      const params = new URLSearchParams(searchParams);
      for (const key of FILTER_COLUMN_KEYS) {
        params.delete(key);
      }
      for (const [key, value] of Object.entries(next.filters)) {
        if (value) {
          params.set(key, value);
        }
      }
      params.delete("page");
      router.push(params.size > 0 ? `${pathname}?${params}` : pathname);
      return;
    }
    setSort(next.sort);
  }

  const sorted = useMemo(() => {
    if (!query.sort) {
      return events;
    }
    const { key, dir } = query.sort;
    const withValues = events.map((event) => ({
      event,
      value: sortValue(event, key as SortableKey),
    }));
    withValues.sort((a, b) => {
      const cmp = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return withValues.map((w) => w.event);
  }, [events, query.sort]);

  return (
    <DataTable
      className="w-full min-w-0 overflow-x-auto"
      columns={columns}
      empty={empty}
      onQueryChange={onQueryChange}
      query={query}
      title={title}
      toolbar={toolbar}
    >
      {sorted.map((event) => (
        <Row event={event} key={event.id} />
      ))}
    </DataTable>
  );
}

/**
 * Which page numbers to show around the current one, with `null` standing in
 * for an ellipsis — always the first and last page, plus one on each side, so
 * a 40-page result set reads `1 … 4 5 6 … 40`.
 */
function pageWindow(page: number, pages: number): (number | null)[] {
  const window = new Set([1, pages, page - 1, page, page + 1]);
  const sorted = [...window]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  let previous: number | undefined;
  for (const n of sorted) {
    if (previous !== undefined && n - previous > 1) {
      result.push(null);
    }
    result.push(n);
    previous = n;
  }
  return result;
}

/**
 * Builds its own page links from `params` rather than taking a callback prop:
 * a function isn't serializable across the Server→Client boundary.
 */
export function AuditPagination({
  page,
  pages,
  params,
}: {
  page: number;
  pages: number;
  params: Record<string, string | undefined>;
}): ReactNode {
  const link = (next: number): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") {
        query.set(key, value);
      }
    }
    query.set("page", String(next));
    return `/audit?${query.toString()}`;
  };
  return (
    <Pagination className="mx-0 w-fit justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : ""}
            href={link(Math.max(page - 1, 1))}
          />
        </PaginationItem>
        {pageWindow(page, pages).map((n, i) =>
          n === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis positions are stable for a given page/pages pair, and carry no identity of their own.
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={n}>
              <PaginationLink href={link(n)} isActive={n === page}>
                {n}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            aria-disabled={page >= pages}
            className={page >= pages ? "pointer-events-none opacity-40" : ""}
            href={link(Math.min(page + 1, pages))}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

// Mirrors the on-screen column model exactly — no raw context dump, no IP
// address: that field is details-page-only, so the export never shows an
// administrator more than the table already did.
