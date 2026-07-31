"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/vendor/ui/button";
import { Input } from "@/components/vendor/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/vendor/ui/table";

/**
 * Reusable console data table: client-side search/sort/pagination over an
 * already-fetched row array. Used by Applications/Identities/Audit Logs
 * (see console.nav.tsx's three data pages) and meant for any future
 * console list page.
 *
 * Server-side filtering (e.g. Identities' email/state/verified GET-param
 * filters, Audit Logs' resource_type/action filters) stays exactly where
 * it already lives — as real searchParams-driven Server Component filters
 * on each page — this component only adds instant client-side search,
 * column sort, and pagination on top of whatever rows the page already
 * fetched. None of the three backing services (console-api's identity
 * list, app-registry, audit-service) support real server-side pagination
 * today (confirmed: no page/pageToken/limit params on any of their list
 * calls except Kratos's own admin SDK, which the Identities page already
 * uses with a fixed pageSize). This component's contract is built to
 * survive that changing later: page/pageSize are plain component state
 * today, but a caller migrating to a real paginated adapter only needs to
 * pass an already-server-paginated `rows` slice plus a `totalCount` —
 * nothing about the rendering or column API needs to change.
 */
export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Omit to make this column unsortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  searchableText,
  searchPlaceholder = "Search…",
  pageSize = 20,
  emptyMessage = "No results.",
  stickyHeader = false,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Omit to hide the built-in client-side search box. */
  searchableText?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  stickyHeader?: boolean;
}): ReactNode {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!searchableText || !query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchableText(row).toLowerCase().includes(needle));
  }, [rows, query, searchableText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortValue) return filtered;
    const withValues = filtered.map((row) => ({ row, value: column.sortValue!(row) }));
    withValues.sort((a, b) => {
      const cmp = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return withValues.map((w) => w.row);
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function toggleSort(columnId: string): void {
    setPage(0);
    setSort((prev) => {
      if (!prev || prev.id !== columnId) return { id: columnId, dir: "asc" };
      if (prev.dir === "asc") return { id: columnId, dir: "desc" };
      return null;
    });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {searchableText ? (
        <Input
          aria-label="Search"
          className="max-w-sm"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          value={query}
        />
      ) : null}

      {/* overflow-x-auto keeps a wide table scrolling INSIDE this box —
          the page/content column itself never overflows regardless of how
          many columns a caller passes. */}
      <div className="w-full min-w-0 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className={stickyHeader ? "sticky top-0 z-10 bg-background" : undefined}>
            <TableRow>
              {columns.map((column) => (
                <TableHead className={column.className} key={column.id}>
                  {column.sortValue ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort(column.id)}
                      type="button"
                    >
                      {column.header}
                      {sort?.id === column.id ? (sort.dir === "asc" ? "↑" : "↓") : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-muted-foreground" colSpan={columns.length}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={getRowKey(row)}>
                  {columns.map((column) => (
                    <TableCell className={column.className} key={column.id}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {sorted.length === 0
            ? "0 results"
            : `Showing ${start + 1}–${Math.min(sorted.length, start + pageSize)} of ${sorted.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            size="sm"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            size="sm"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
