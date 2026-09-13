import type { AuditTrendBucket } from "@aec-craft/platform-id-contracts/audit/audit.filters";
import {
  auditActionLabel,
  auditResourceLabel,
  authMethodLabel,
} from "@aec-craft/platform-id-contracts/audit/audit.labels";
import {
  type AuditQuery,
  activityTrend,
  countByResource,
  countByStatus,
  topActions,
  topActors,
  topAuthMethods,
  topResources,
} from "@aec-craft/platform-id-db/audit";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import type { ReactNode } from "react";
import { AuditBreakdown } from "../audit.breakdown";
import { ResourceChart, ResultChart, TrendChart } from "../audit.charts";
import { AuditHeader } from "../audit.header";
import type { AuditParams } from "../audit.range";
import { selectedAfter, trendBucketFor } from "../audit.range";
import { AuditTimeRange } from "../audit.toolbar";

export const dynamic = "force-dynamic";

/**
 * The shape of what happened, rather than the record of it: how activity moved
 * over the selected range, what it was about, and who did most of it.
 *
 * Its own route rather than a block above the table, because it answers a
 * different question. Somebody opening the audit log to find one event should
 * reach the table immediately; somebody asking how the platform is being used
 * comes here.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AuditParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const after = selectedAfter(params);
  const bucket = trendBucketFor(params.range);
  // The range is the only thing this view reads. The log's column filters do
  // not reach it — a breakdown of one already-chosen person is a list of one —
  // which is why no filter chips are rendered here to suggest otherwise.
  const rangeQuery: AuditQuery = { after };

  const {
    resourceCounts,
    statusCounts,
    topActionRows,
    topActorRows,
    topAuthMethodRows,
    topResourceRows,
    trendPoints,
  } = await load(rangeQuery, bucket);

  return (
    <div className="flex flex-col gap-6 p-6">
      <AuditHeader actions={<AuditTimeRange />} view="analytics" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Activity trend</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <TrendChart bucket={bucket} points={trendPoints} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Activity by resource</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResourceChart counts={resourceCounts} />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle className="text-base">Audit insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AuditBreakdown
              empty="No audit events recorded yet."
              href={(id) => {
                const [resource, verb] = id.split(":");
                return `/audit?resource=${encodeURIComponent(resource ?? "")}&verb=${encodeURIComponent(verb ?? "")}`;
              }}
              rows={topActionRows}
              title="Most frequent actions"
            />
            <AuditBreakdown
              empty="Nobody has done anything yet."
              href={(id) => `/audit?actorId=${encodeURIComponent(id)}`}
              rows={topActorRows}
              title="Most active users"
            />
            <AuditBreakdown
              empty="Nothing has been changed yet."
              href={(id) => `/audit?resourceId=${encodeURIComponent(id)}`}
              rows={topResourceRows}
              title="Most affected items"
            />
            <AuditBreakdown
              empty="No sign-ins recorded yet."
              href={(id) => `/audit?authMethod=${encodeURIComponent(id)}`}
              rows={topAuthMethodRows}
              title="Authentication methods"
            />
          </div>
          <div className="mt-4 border-foreground/10 border-t pt-4">
            <span className="mb-2 block text-muted-foreground text-xs uppercase tracking-[0.08em]">
              Result distribution
            </span>
            <div className="h-28">
              <ResultChart counts={statusCounts} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Every read this view needs, issued together. */
async function load(rangeQuery: AuditQuery, bucket: AuditTrendBucket) {
  const [
    statusCounts,
    resourceCounts,
    trendPoints,
    topActionRows,
    topActorRows,
    topResourceRows,
    topAuthMethodRows,
  ] = await Promise.all([
    countByStatus(rangeQuery),
    countByResource(rangeQuery),
    activityTrend({ ...rangeQuery, bucket }),
    topActions(rangeQuery, 4),
    topActors(rangeQuery, 4),
    topResources(rangeQuery, 4),
    topAuthMethods(rangeQuery, 4),
  ]);

  return {
    resourceCounts,
    statusCounts,
    topActionRows: topActionRows.map((row) => ({
      count: row.count,
      id: `${row.resource}:${row.verb}`,
      label: auditActionLabel(row),
    })),
    topActorRows,
    topAuthMethodRows: topAuthMethodRows.map((row) => ({
      count: row.count,
      id: row.method,
      label: authMethodLabel(row.method),
    })),
    topResourceRows: topResourceRows.map((row) => ({
      count: row.count,
      id: row.id,
      label: `${row.label} (${auditResourceLabel(row.resource)})`,
    })),
    trendPoints,
  };
}
