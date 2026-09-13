"use client";

import type { AuditTrendBucket } from "@aec-craft/platform-id-contracts/audit/audit.filters";
import {
  auditResourceLabel,
  auditStatusLabel,
} from "@aec-craft/platform-id-contracts/audit/audit.labels";
import { BarChart } from "@aec-craft/ui/components/blocks/bar-chart";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@aec-craft/ui/components/primitives/chart";
import type { ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The Audit Logs page's three charts. Each reads a real aggregation over every
 * event matching the current filters, not a sampled window — a figure that
 * quietly went approximate past some row count would be worse than not showing
 * it at all.
 */

const CHART_EMPTY = (
  <p className="text-muted-foreground text-sm">No audit events recorded yet.</p>
);

/** Events per resource, largest first — a plain GROUP BY on a real column. */
export function ResourceChart({
  counts,
}: {
  counts: { resource: string; count: number }[];
}): ReactNode {
  if (counts.length === 0) {
    return CHART_EMPTY;
  }
  return (
    <BarChart
      data={counts.map((row) => ({
        label: auditResourceLabel(row.resource),
        value: row.count,
      }))}
      labelWidth={96}
    />
  );
}

/** Success/failure/denied, including "Denied" once one has been recorded — no
 *  placeholder bucket for a result nothing produced. */
export function ResultChart({
  counts,
}: {
  counts: { status: string; count: number }[];
}): ReactNode {
  if (counts.length === 0) {
    return CHART_EMPTY;
  }
  return (
    <BarChart
      data={counts.map((row) => ({
        label: auditStatusLabel(row.status),
        value: row.count,
      }))}
      labelWidth={72}
    />
  );
}

const TREND_CONFIG = {
  value: { label: "Events", color: "var(--foreground)" },
} satisfies ChartConfig;

function formatBucket(date: Date, bucket: AuditTrendBucket): string {
  if (bucket === "minute" || bucket === "hour") {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * A time-series line over `@aec-craft/ui`'s published `chart` primitive and
 * recharts directly — the same composition that package's own `bar-chart`
 * block uses internally, inlined here rather than factored into a new shared
 * block: this app's only line-chart need.
 */
export function TrendChart({
  bucket,
  points,
}: {
  bucket: AuditTrendBucket;
  points: { bucket: Date; count: number }[];
}): ReactNode {
  if (points.length === 0) {
    return CHART_EMPTY;
  }
  const data = points.map((row) => ({
    label: formatBucket(row.bucket, bucket),
    value: row.count,
  }));
  return (
    <ChartContainer className="aspect-auto h-full w-full" config={TREND_CONFIG}>
      <RechartsLineChart
        accessibilityLayer
        data={data}
        margin={{ left: 0, right: 8, top: 8, bottom: 2 }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} hide tickLine={false} width={0} />
        <ChartTooltip
          content={<ChartTooltipContent />}
          cursor={{ stroke: "var(--border)" }}
        />
        <Line
          // Real dots, not `dot={false}`: when the selected range only has one
          // or two buckets with data, a dotless line renders as nothing (or a
          // single bare segment) — showing each actual point keeps sparse real
          // data legible instead of reading as broken.
          dataKey="value"
          dot={{ fill: "var(--color-value)", r: 3 }}
          stroke="var(--color-value)"
          strokeWidth={2}
          type="monotone"
        />
      </RechartsLineChart>
    </ChartContainer>
  );
}
