import type { AuditTrendBucket } from "@aec-craft/platform-id-contracts/audit/audit.filters";
import type { AuditQuery } from "@aec-craft/platform-id-db/audit";

/**
 * Reading the page's own query string, shared by the log and the analytics
 * views so the two never disagree about what the current selection means.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const RANGE_MS: Record<string, number> = {
  "15m": 15 * MINUTE_MS,
  "1h": HOUR_MS,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export type AuditParams = Record<string, string | undefined>;

/**
 * Every filter the log offers, split by whether the table gives it a column.
 * Here rather than beside the controls because the page is a Server Component
 * and `audit.filters.tsx` is `"use client"`: a server module cannot read into a
 * client one, and a second copy of these lists is what left "Clear all filters"
 * offering `q` and `ip` after both controls had gone.
 */
export const COLUMN_FILTER_KEYS = [
  "resource",
  "verb",
  "actor",
  "item",
  "application",
  "status",
] as const;

export const MORE_FILTER_KEYS = [
  "range",
  "requestId",
  "sessionId",
  "eventId",
] as const;

/** Whether anything is narrowing the table right now. */
export function hasActiveFilters(params: AuditParams): boolean {
  return [...COLUMN_FILTER_KEYS, ...MORE_FILTER_KEYS].some(
    (key) => params[key]
  );
}

/** Only events at or after this instant, or undefined for all time. */
export function selectedAfter(params: AuditParams): Date | undefined {
  const rangeMs = params.range ? RANGE_MS[params.range] : undefined;
  return rangeMs ? new Date(Date.now() - rangeMs) : undefined;
}

/** A short range reads better minute by minute or hour by hour; a long or
 *  unbounded one reads better day by day — an hourly bucket over 30 days would
 *  be hundreds of points nobody can read as a trend, and a day bucket over 15
 *  minutes would be a single point. */
export function trendBucketFor(range: string | undefined): AuditTrendBucket {
  if (range === "15m" || range === "1h") {
    return "minute";
  }
  if (range === "24h") {
    return "hour";
  }
  return "day";
}

/**
 * Every toolbar, column and advanced-filter param, translated into the one
 * `AuditQuery` the repository takes. It answers more than this maps: `ip`,
 * `authMethod` and `search` are in the feed's published spec and no control
 * here sets them.
 *
 * The Application filter is the OAuth client an event happened *through*
 * (`applicationId`), never the entity being modified (`resourceId`, which
 * "Item ID" filters instead).
 */
export function queryFor(
  params: AuditParams,
  after: Date | undefined
): AuditQuery {
  return {
    actor: params.actor || undefined,
    actorId: params.actorId || undefined,
    after,
    applicationId: params.application || undefined,
    eventId: params.eventId || undefined,
    requestId: params.requestId || undefined,
    resource: params.resource || undefined,
    resourceId: params.resourceId || undefined,
    resourceLabel: params.item || undefined,
    sessionId: params.sessionId || undefined,
    status: params.status || undefined,
    verb: params.verb || undefined,
  };
}

/**
 * Carries the current selection onto the other view's link, so switching
 * between the log and its analytics keeps the time range and filters rather
 * than resetting to all time.
 */
export function withParams(path: string, params: AuditParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") {
      query.set(key, value);
    }
  }
  return query.size > 0 ? `${path}?${query.toString()}` : path;
}
