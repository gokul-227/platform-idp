import {
  type AuditQuery,
  filterOptions,
  listEvents,
  overview,
} from "@aec-craft/platform-id-db/audit";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import type { ReactNode } from "react";
import { resourceOptions, verbOptions } from "@/lib/audit.event";
import { AuditHeader } from "./audit.header";
import type { AuditParams } from "./audit.range";
import { queryFor, selectedAfter } from "./audit.range";
import { AuditPagination, type AuditRowEvent, AuditTable } from "./audit.table";
import { AuditToolbar } from "./audit.toolbar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** A count, grouped so a five-figure total stays readable at a glance. */
const NUMBER = new Intl.NumberFormat("en-GB");

/**
 * A share of the last 24 hours, or null when nothing arrived in them.
 *
 * Null rather than 0%: with no events there is no rate, and printing one would
 * report a perfectly quiet day as total failure.
 */
function rateOf(part: number, whole: number): number | null {
  if (whole === 0) {
    return null;
  }
  return Math.round((part / whole) * 100);
}

/**
 * A single figure and what it is drawn from.
 *
 * No colour on any of them: the console keeps its one accent for a refusal an
 * operator has to act on, and a rate that happens to be low is not yet that.
 */
function Stat({
  label,
  note,
  value,
}: {
  label: string;
  note?: string | null;
  value: string;
}): ReactNode {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="font-semibold text-3xl tabular-nums tracking-tight">
          {value}
        </span>
        {note ? (
          <p className="mt-1 text-muted-foreground text-xs">{note}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AuditParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const after = selectedAfter(params);
  const query = queryFor(params, after);
  // The figures above the table answer for the selected range as a whole, not
  // for the page's own filters: narrowing to one person should not make
  // "sign-ins" describe only them.
  const rangeQuery: AuditQuery = { after };

  // Uncaught on purpose: `error.tsx` beside this file is the fault page, and a
  // log that renders "no events" when it could not read is worse than one that
  // says it is broken.
  const { applications, events, resources, stats, total, verbs } = await load(
    query,
    rangeQuery,
    page
  );

  const successRate = rateOf(stats.recentSuccess, stats.recent);
  const refusedRate = rateOf(stats.recentRefused, stats.recent);

  const applicationOptions = applications
    .map((app) => ({ label: app.name, value: app.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const resourceFilterOptions = resourceOptions(resources);

  const rows: AuditRowEvent[] = events.map((event) => ({
    ...event,
    actorLabel: event.actorName ?? event.actorEmail ?? "—",
  }));

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="flex flex-col gap-6 p-6">
      <AuditHeader view="logs" />

      {/* The log's own health, on a fixed window: how much history there is,
          whether anything is still arriving, and how much of it went through.
          Independent of the filters below, which answer a different question.
          The two rates are complements by construction — an event is either a
          success or it is not — and both are shown because an operator scans
          for whichever one they came to check. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total events"
          note="All time"
          value={NUMBER.format(stats.total)}
        />
        <Stat
          label="Last 24 hours"
          note={stats.recent === 0 ? "Nothing recorded" : "Events recorded"}
          value={NUMBER.format(stats.recent)}
        />
        <Stat
          label="Success rate"
          note={
            successRate === null
              ? "No events in the last 24 hours"
              : `${NUMBER.format(stats.recentSuccess)} of ${NUMBER.format(stats.recent)} in the last 24 hours`
          }
          value={successRate === null ? "—" : `${successRate}%`}
        />
        <Stat
          label="Failed or denied"
          note={
            refusedRate === null
              ? "No events in the last 24 hours"
              : `${NUMBER.format(stats.recentRefused)} of ${NUMBER.format(stats.recent)} in the last 24 hours`
          }
          value={refusedRate === null ? "—" : `${refusedRate}%`}
        />
      </div>

      {/* No title on the table: the page header names this view, and the count
          belongs beside the page number below, where it says which slice of how
          many you are looking at. It read "83 events" in both places. */}
      <AuditTable
        applications={applicationOptions}
        empty="No events match these filters."
        events={rows}
        resources={resourceFilterOptions}
        toolbar={<AuditToolbar params={params} />}
        verbs={verbOptions(verbs)}
      />

      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>
          {total} event{total === 1 ? "" : "s"} · page {page} of {pages}
        </span>
        <AuditPagination page={page} pages={pages} params={params} />
      </div>
    </div>
  );
}

/** Every read this view needs, issued together. */
async function load(query: AuditQuery, rangeQuery: AuditQuery, page: number) {
  const [listed, options, stats] = await Promise.all([
    listEvents({ ...query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    // Scoped to the same range as the figures, so the dropdowns offer what the
    // current view can contain rather than every value the table has ever held.
    filterOptions(rangeQuery),
    overview(),
  ]);

  return {
    applications: options.applications,
    authMethods: options.authMethods,
    events: listed.events,
    resources: options.resources,
    stats,
    total: listed.total,
    verbs: options.verbs,
  };
}
