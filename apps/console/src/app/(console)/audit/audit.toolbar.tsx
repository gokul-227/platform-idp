"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@aec-craft/ui/components/primitives/collapsible";
import { Input } from "@aec-craft/ui/components/primitives/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aec-craft/ui/components/primitives/select";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { type FilterOption, RANGE_LABEL } from "@/lib/audit.event";
import {
  COLUMN_FILTER_KEYS,
  hasActiveFilters,
  MORE_FILTER_KEYS,
} from "./audit.range";

/**
 * Everything above the audit table: the filter form, and the one way out of it.
 * One component because it fills one slot — the page passing two children and a
 * flex wrapper made the table's toolbar something the page had to assemble.
 *
 * Every control's query-param name is the filter's name in
 * `@aec-craft/platform-id-contracts`, so a filter added there is wired by naming
 * it here and nowhere else. `AuditTimeRange` is the same control hoisted into
 * the analytics header, which has no toolbar to hold it.
 */

/** The time range's own unset label: "All" alone would read as "all ranges". */
const ALL_TIME_LABEL = "All time";

/** The same windows the analytics header offers, as filter options. One
 *  vocabulary, so a range means the same thing on both views. */
const RANGE_OPTIONS: FilterOption[] = Object.entries(RANGE_LABEL).map(
  ([value, label]) => ({ label, value })
);

/**
 * The filters with no column of their own. The User and Target columns already
 * match ids, so those entries went; what is left is the time range and the three
 * ids that identify one event or one chain of them.
 */

/**
 * A filter drawn from a known set, in the design system's `Select` so it reads
 * like the column filters beside it rather than a native control.
 */
function FilterSelect({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue: string;
  label: string;
  name: string;
  options: FilterOption[];
}): ReactNode {
  const items = Object.fromEntries(
    options.map((option) => [option.value, option.label])
  );
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs" id={`${name}-label`}>
        {label}
      </span>
      <Select defaultValue={defaultValue} items={items} name={name}>
        <SelectTrigger
          aria-labelledby={`${name}-label`}
          className="min-w-40"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="">{ALL_TIME_LABEL}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function TextFilter({
  defaultValue,
  label,
  name,
}: {
  defaultValue: string;
  label: string;
  name: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="text-muted-foreground text-xs" htmlFor={name}>
        {label}
      </label>
      <Input defaultValue={defaultValue} id={name} name={name} />
    </div>
  );
}

/**
 * The toolbar form: a search box, everything else behind "More filters". Only
 * filters with no column to hang a control on, since a second control for the same
 * query param drifts from the first. GET, so a filtered view is a URL somebody
 * can send.
 */
export function AuditToolbar({
  params,
}: {
  params: Record<string, string | undefined>;
}): ReactNode {
  // Counted on the trigger because these have no column to show them set, and
  // the chips that used to say so are gone.
  const moreActive = MORE_FILTER_KEYS.filter((key) => params[key]).length;
  return (
    <div className="flex w-full flex-col gap-3">
      <form className="flex flex-col gap-3" method="GET">
        {/* The column filters carry over on submit via hidden fields: this form's
          own GET only knows about its own inputs, so without these submitting
          would silently clear whichever column filter is active. No wrapper,
          which would reserve an empty row now that nothing visible sits here. */}
        {COLUMN_FILTER_KEYS.map((key) => (
          <input key={key} name={key} type="hidden" value={params[key] ?? ""} />
        ))}

        <Collapsible>
          <CollapsibleTrigger
            className="text-muted-foreground text-xs underline hover:text-foreground"
            render={<button type="button" />}
          >
            More filters
            {moreActive > 0 ? ` (${moreActive})` : ""}
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-wrap items-end gap-3 pt-3">
            {/* Here rather than beside the page title: it is one filter among
              these, and the table is what it narrows. Analytics carries it in
              its header because that view has no filter panel to hold it. */}
            <FilterSelect
              defaultValue={params.range ?? ""}
              label="Time range"
              name="range"
              options={RANGE_OPTIONS}
            />
            <TextFilter
              defaultValue={params.requestId ?? ""}
              label="Request ID"
              name="requestId"
            />
            <TextFilter
              defaultValue={params.sessionId ?? ""}
              label="Session ID"
              name="sessionId"
            />
            <TextFilter
              defaultValue={params.eventId ?? ""}
              label="Event ID"
              name="eventId"
            />
            {/* Last in the row of fields, and only reachable once the panel is
              open: a submit sitting above a collapsed panel offered to apply
              filters none of which were on screen. */}
            <Button size="sm" type="submit">
              Filter
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </form>

      {/* The only way out that neither a filled column header nor the count on
          "More filters" can offer. */}
      {hasActiveFilters(params) ? (
        <Link
          className="w-fit text-muted-foreground text-xs hover:text-foreground hover:underline"
          href="/audit"
        >
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The global time-range control, in the page header rather than the table's
 * filter toolbar — one range applies to everything on the page, so it reads as
 * a page-level setting rather than one more column filter.
 */
export function AuditTimeRange(): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string | null): void {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("range", value);
    } else {
      next.delete("range");
    }
    // Paging belongs to a result set, and changing the range makes a new one.
    next.delete("page");
    // Back to the page this is on, not a hardcoded one: both audit views carry
    // this control, and picking a range on either is a change to that view.
    router.push(next.size > 0 ? `${pathname}?${next}` : pathname);
  }

  const items = { "": ALL_TIME_LABEL, ...RANGE_LABEL };

  return (
    <Select
      defaultValue={searchParams.get("range") ?? ""}
      items={items}
      onValueChange={onChange}
    >
      <SelectTrigger aria-label="Time range" className="min-w-40" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="">{ALL_TIME_LABEL}</SelectItem>
          {Object.entries(RANGE_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
