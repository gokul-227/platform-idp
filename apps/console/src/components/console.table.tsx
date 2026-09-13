"use client";

import {
  DataTable,
  type DataTableProps,
  type TableQuery,
  type TableSort,
} from "@aec-craft/ui/components/blocks/data-table";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { PAGE_PARAM, readTrail } from "@/lib/pagination";

/**
 * DataTable with its filters, sort and page mirrored into the URL, so a server
 * page reads them from `searchParams`. Only params matching column keys are
 * owned as filters.
 *
 * Sort is opt-in per column and rides in `?sort=field:dir`, the shape platform's
 * list dialect already parses. A column is `sortable` only where the list behind
 * it can order the whole set: the Ory admin APIs cannot, and ordering a fetched
 * page reorders a slice rather than the table.
 */
const SORT_PARAM = "sort";

/** `field:dir`, or null for anything else in the parameter. */
function readSort(value: string | null): TableSort | undefined {
  const [key, dir] = (value ?? "").split(":");
  if (!key || (dir !== "asc" && dir !== "desc")) {
    return;
  }
  return { dir, key };
}

export function ConsoleTable({
  action,
  nextToken,
  ...props
}: Omit<DataTableProps, "onQueryChange" | "query" | "toolbar"> & {
  /** Rendered on the left of the toolbar row, opposite the pager: the action
   *  that adds to the table belongs beside it, not floating above. */
  action?: ReactNode;
  /** Token for the page after this one, from the list response's `Link`. */
  nextToken?: string | undefined;
}): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const columnKeys = new Set(
    props.columns.map((column) => column.key).filter(Boolean) as string[]
  );

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (columnKeys.has(key)) {
      filters[key] = value;
    }
  }

  const sort = readSort(searchParams.get(SORT_PARAM));
  const trail = readTrail(searchParams.get(PAGE_PARAM) ?? undefined);
  const pageNumber = trail.length + 1;

  function href(params: URLSearchParams): string {
    return params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
  }

  function handleQueryChange(query: TableQuery): void {
    const next = new URLSearchParams(searchParams);
    for (const key of columnKeys) {
      next.delete(key);
    }
    for (const [key, value] of Object.entries(query.filters)) {
      if (value && columnKeys.has(key)) {
        next.set(key, value);
      }
    }
    if (query.sort) {
      next.set(SORT_PARAM, `${query.sort.key}:${query.sort.dir}`);
    } else {
      next.delete(SORT_PARAM);
    }
    // A token addresses a page of the result set it was issued for, so a
    // changed filter starts over at page one.
    next.delete(PAGE_PARAM);
    router.replace(href(next));
  }

  function goTo(pages: string[]): void {
    const next = new URLSearchParams(searchParams);
    if (pages.length > 0) {
      next.set(PAGE_PARAM, pages.join(","));
    } else {
      next.delete(PAGE_PARAM);
    }
    // Pushed, not replaced: each page is its own URL, so browser back walks the
    // same trail the buttons do.
    router.push(href(next));
  }

  const pager = (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">Page {pageNumber}</span>
      <div className="flex items-center gap-1">
        <Button
          disabled={pageNumber === 1}
          onClick={() => goTo([])}
          size="sm"
          variant="ghost"
        >
          First
        </Button>
        <Button
          disabled={pageNumber === 1}
          onClick={() => goTo(trail.slice(0, -1))}
          size="sm"
          variant="ghost"
        >
          Previous
        </Button>
        <Button
          disabled={!nextToken}
          onClick={() => {
            if (nextToken) {
              goTo([...trail, nextToken]);
            }
          }}
          size="sm"
          variant="ghost"
        >
          Next
        </Button>
      </div>
    </div>
  );

  // Skeleton rows match the page on screen, so a page change does not resize
  // the table on its way in.
  const rowCount = Array.isArray(props.children)
    ? props.children.length
    : undefined;

  return (
    <DataTable
      {...props}
      isLoading={props.isLoading}
      onQueryChange={handleQueryChange}
      query={{ filters, ...(sort ? { sort } : {}) }}
      {...(rowCount ? { skeletonRows: rowCount } : {})}
      {...(action || pageNumber > 1 || nextToken
        ? {
            toolbar: (
              <div className="flex w-full items-center justify-between gap-2">
                {action ?? <span />}
                {pageNumber > 1 || nextToken ? pager : null}
              </div>
            ),
          }
        : {})}
    />
  );
}
