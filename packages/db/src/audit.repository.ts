import type { AuditTrendBucket } from "@aec-craft/platform-id-contracts/audit/audit.filters";
import { AUDIT_LIST } from "@aec-craft/platform-id-contracts/audit/audit.filters";
import type {
  AuditAction,
  AuditActorType,
  AuditStatus,
} from "@aec-craft/platform-id-contracts/audit/audit.vocabulary";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { type AuditLogRow, auditLog } from "./audit.table";
import { db } from "./client";

/**
 * One recorded event, as every surface reads it. `resource`/`verb` stay the
 * canonical pair — nothing here renders them into a sentence; the labels live
 * in `@aec-craft/platform-id-contracts/audit/audit.labels`, next to the
 * vocabulary that declares them.
 */
export type AuditEvent = AuditLogRow;

/**
 * What a call site supplies. The `(resource, verb)` pair is the contracts
 * union, so an invalid pairing does not compile.
 */
export type RecordEventInput = AuditAction & {
  actorType?: AuditActorType;
  actorIdentityId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  status?: AuditStatus;
  resourceId?: string | null;
  /** What the subject was called at the time — an application's name, a
   *  person's email. Recorded rather than joined: half these events remove the
   *  row that held it. */
  resourceLabel?: string | null;
  organization?: string | null;
  applicationId?: string | null;
  applicationName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  /** Facts about the call: how the actor authenticated, why a change was
   *  refused. Not what moved — that is `payload`. */
  context?: Record<string, unknown>;
  /** What moved, as `before`/`after` where there is a diff to show. */
  payload?: Record<string, unknown>;
};

/**
 * Never throws. An audit write failing must not fail the operation it is
 * describing — a person who cannot sign in because the audit table is full is
 * a worse outcome than a missing row, and the error still reaches the log.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    await db()
      .insert(auditLog)
      .values({
        resource: input.resource,
        verb: input.verb,
        actorType: input.actorType ?? "user",
        actorIdentityId: input.actorIdentityId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorName: input.actorName ?? null,
        status: input.status ?? "success",
        resourceId: input.resourceId ?? null,
        resourceLabel: input.resourceLabel ?? null,
        organization: input.organization ?? null,
        applicationId: input.applicationId ?? null,
        applicationName: input.applicationName ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        sessionId: input.sessionId ?? null,
        context: input.context ?? {},
        payload: input.payload ?? null,
      });
  } catch (error) {
    console.error(
      "[audit] failed to record event",
      `${input.resource}.${input.verb}`,
      error
    );
  }
}

/**
 * The filters a read accepts, one per entry in the contracts filter spec.
 * Named for the wire, not the column: `actorId` reads `actor_identity_id`.
 */
export interface AuditQuery {
  actor?: string;
  actorId?: string;
  after?: Date;
  applicationId?: string;
  authMethod?: string;
  eventId?: string;
  ip?: string;
  limit?: number;
  offset?: number;
  organization?: string;
  requestId?: string;
  resource?: string;
  resourceId?: string;
  resourceLabel?: string;
  search?: string;
  sessionId?: string;
  status?: string;
  verb?: string;
}

/** A term matched anywhere inside a text column. */
function substring(column: AnyPgColumn, term: string): SQL {
  return ilike(column, `%${term}%`);
}

/**
 * The one predicate builder behind the list read and every aggregation, so the
 * table and the charts cannot disagree about what the query matches. `undefined`
 * entries are dropped by `and`, so an absent filter adds nothing.
 */
function predicate(options: AuditQuery): SQL | undefined {
  const terms: (SQL | undefined)[] = [
    options.resource ? eq(auditLog.resource, options.resource) : undefined,
    options.verb ? eq(auditLog.verb, options.verb) : undefined,
    options.status ? eq(auditLog.status, options.status) : undefined,
    options.actorId ? eq(auditLog.actorIdentityId, options.actorId) : undefined,
    options.resourceId
      ? eq(auditLog.resourceId, options.resourceId)
      : undefined,
    options.applicationId
      ? eq(auditLog.applicationId, options.applicationId)
      : undefined,
    options.sessionId ? eq(auditLog.sessionId, options.sessionId) : undefined,
    options.requestId ? eq(auditLog.requestId, options.requestId) : undefined,
    options.organization
      ? eq(auditLog.organization, options.organization)
      : undefined,
    options.after ? gte(auditLog.createdAt, options.after) : undefined,
    options.authMethod
      ? sql`${auditLog.context}->>'authMethod' = ${options.authMethod}`
      : undefined,
    // `inet`, so a substring match has to compare it as text.
    options.ip
      ? sql`${auditLog.ip}::text ILIKE ${`%${options.ip}%`}`
      : undefined,
    // `id` is a uuid; an unparseable one must read as "no match" rather than
    // raise, so it is compared as text.
    options.eventId
      ? sql`${auditLog.id}::text = ${options.eventId}`
      : undefined,
    // The label and the id together, because the column offers "name or id" and
    // matching only the label made that a promise it did not keep. The actor
    // filter below already worked this way.
    options.resourceLabel
      ? or(
          substring(auditLog.resourceLabel, options.resourceLabel),
          substring(auditLog.resourceId, options.resourceLabel)
        )
      : undefined,
    options.actor
      ? or(
          substring(auditLog.actorEmail, options.actor),
          substring(auditLog.actorName, options.actor),
          substring(auditLog.actorIdentityId, options.actor)
        )
      : undefined,
    // The fields somebody pastes from a ticket or reads off a screen, per
    // SEARCH_ACROSS in the contracts filter spec.
    options.search
      ? or(
          substring(auditLog.actorEmail, options.search),
          substring(auditLog.actorName, options.search),
          substring(auditLog.actorIdentityId, options.search),
          substring(auditLog.resourceLabel, options.search),
          substring(auditLog.resourceId, options.search),
          substring(auditLog.applicationName, options.search),
          substring(auditLog.sessionId, options.search),
          substring(auditLog.requestId, options.search)
        )
      : undefined,
  ];
  return and(...terms.filter((term): term is SQL => term !== undefined));
}

function boundedLimit(limit: number | undefined): number {
  const value = Number.isFinite(limit)
    ? Number(limit)
    : AUDIT_LIST.defaultLimit;
  return Math.min(Math.max(value, 1), AUDIT_LIST.maxLimit);
}

/**
 * One page of events, newest first, with the total behind the same filters.
 *
 * The count rides along as a window function rather than a second round trip:
 * every caller needs both, and asking twice doubles the scan the filters just
 * described.
 */
export async function listEvents(
  options: AuditQuery = {}
): Promise<{ events: AuditEvent[]; total: number }> {
  const rows = await db()
    .select({
      row: auditLog,
      total: sql<string>`count(*) OVER ()`,
    })
    .from(auditLog)
    .where(predicate(options))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(boundedLimit(options.limit))
    .offset(Math.max(options.offset ?? 0, 0));

  return {
    events: rows.map((row) => row.row),
    total: Number(rows[0]?.total ?? 0),
  };
}

/** One event by id. Null rather than throwing: a stale link is a 404. */
export async function getEventById(id: string): Promise<AuditEvent | null> {
  const rows = await db()
    .select()
    .from(auditLog)
    .where(sql`${auditLog.id}::text = ${id}`)
    .limit(1);
  return rows[0] ?? null;
}

export interface AuditOverview {
  /** Rows in the last 24 hours: whether anything is arriving at all. */
  recent: number;
  recentRefused: number;
  /** Of those, how many went through, and how many did not. Rates are derived
   *  from these rather than stored, so they cannot disagree with the counts. */
  recentSuccess: number;
  /** Every row the log holds, all time — how much history there is to search. */
  total: number;
}

/**
 * The figures above the table: unfiltered, on a fixed 24-hour window, because this
 * is the log's own health rather than a second answer to what the table already
 * says. One pass with aggregate filters, four counts over the same rows.
 */
export async function overview(): Promise<AuditOverview> {
  const rows = await db()
    .select({
      total: sql<string>`count(*)`,
      recent: sql<string>`count(*) FILTER (WHERE ${auditLog.createdAt} >= now() - interval '24 hours')`,
      recentSuccess: sql<string>`count(*) FILTER (WHERE ${auditLog.createdAt} >= now() - interval '24 hours' AND ${auditLog.status} = 'success')`,
      recentRefused: sql<string>`count(*) FILTER (WHERE ${auditLog.createdAt} >= now() - interval '24 hours' AND ${auditLog.status} <> 'success')`,
    })
    .from(auditLog);

  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    recent: Number(row?.recent ?? 0),
    recentSuccess: Number(row?.recentSuccess ?? 0),
    recentRefused: Number(row?.recentRefused ?? 0),
  };
}

/** Result breakdown behind the KPI tiles and the result chart. */
export async function countByStatus(
  options: AuditQuery = {}
): Promise<{ status: string; count: number }[]> {
  return await db()
    .select({ status: auditLog.status, count: count() })
    .from(auditLog)
    .where(predicate(options))
    .groupBy(auditLog.status);
}

/** Event count per resource — the category chart. A plain GROUP BY on a real
 *  column, where a fused action string would need the prefix split back out. */
export async function countByResource(
  options: AuditQuery = {}
): Promise<{ resource: string; count: number }[]> {
  return await db()
    .select({ resource: auditLog.resource, count: count() })
    .from(auditLog)
    .where(predicate(options))
    .groupBy(auditLog.resource)
    .orderBy(desc(count()));
}

const BUCKET_SQL: Record<AuditTrendBucket, SQL> = {
  minute: sql`date_trunc('minute', ${auditLog.createdAt})`,
  hour: sql`date_trunc('hour', ${auditLog.createdAt})`,
  day: sql`date_trunc('day', ${auditLog.createdAt})`,
  week: sql`date_trunc('week', ${auditLog.createdAt})`,
};

/** Event count over time — the activity trend. The bucket picks a prepared
 *  fragment rather than interpolating its own name into the statement. */
export async function activityTrend(
  options: AuditQuery & { bucket: AuditTrendBucket }
): Promise<{ bucket: Date; count: number }[]> {
  const { bucket, ...rest } = options;
  const truncated = BUCKET_SQL[bucket];
  const rows = await db()
    .select({ bucket: sql<Date>`${truncated}`.as("bucket"), count: count() })
    .from(auditLog)
    .where(predicate(rest))
    .groupBy(sql`1`)
    .orderBy(asc(sql`1`));
  return rows.map((row) => ({
    bucket: new Date(row.bucket),
    count: row.count,
  }));
}

/** The most frequent actions in the current view, ranked by count. */
export async function topActions(
  options: AuditQuery = {},
  limit = 4
): Promise<{ resource: string; verb: string; count: number }[]> {
  return await db()
    .select({
      resource: auditLog.resource,
      verb: auditLog.verb,
      count: count(),
    })
    .from(auditLog)
    .where(predicate(options))
    .groupBy(auditLog.resource, auditLog.verb)
    .orderBy(desc(count()))
    .limit(Math.min(limit, 50));
}

/**
 * The busiest actors in the current view.
 *
 * Grouped by the identity id and labelled with the newest snapshot seen for
 * it: counting by the email instead would split one person's history in two
 * the day they change it.
 */
export async function topActors(
  options: AuditQuery = {},
  limit = 4
): Promise<{ id: string; label: string; count: number }[]> {
  const rows = await db()
    .select({
      id: auditLog.actorIdentityId,
      label: sql<
        string | null
      >`(array_agg(coalesce(${auditLog.actorName}, ${auditLog.actorEmail}) ORDER BY ${auditLog.createdAt} DESC))[1]`,
      count: count(),
    })
    .from(auditLog)
    .where(
      and(predicate(options), sql`${auditLog.actorIdentityId} IS NOT NULL`)
    )
    .groupBy(auditLog.actorIdentityId)
    .orderBy(desc(count()))
    .limit(Math.min(limit, 50));
  return rows.map((row) => ({
    id: row.id ?? "",
    label: row.label ?? row.id ?? "",
    count: row.count,
  }));
}

/** The most affected subjects in the current view, by recorded label. */
export async function topResources(
  options: AuditQuery = {},
  limit = 4
): Promise<{ id: string; label: string; resource: string; count: number }[]> {
  const rows = await db()
    .select({
      id: auditLog.resourceId,
      resource: auditLog.resource,
      label: sql<
        string | null
      >`(array_agg(${auditLog.resourceLabel} ORDER BY ${auditLog.createdAt} DESC))[1]`,
      count: count(),
    })
    .from(auditLog)
    .where(and(predicate(options), sql`${auditLog.resourceId} IS NOT NULL`))
    .groupBy(auditLog.resourceId, auditLog.resource)
    .orderBy(desc(count()))
    .limit(Math.min(limit, 50));
  return rows.map((row) => ({
    id: row.id ?? "",
    label: row.label ?? row.id ?? "",
    resource: row.resource,
    count: row.count,
  }));
}

/** How people signed in, in the current view — read from the context bag. */
export async function topAuthMethods(
  options: AuditQuery = {},
  limit = 4
): Promise<{ method: string; count: number }[]> {
  const rows = await db()
    .select({
      method: sql<string>`${auditLog.context}->>'authMethod'`,
      count: count(),
    })
    .from(auditLog)
    .where(
      and(
        predicate(options),
        sql`${auditLog.context}->>'authMethod' IS NOT NULL`
      )
    )
    .groupBy(sql`1`)
    .orderBy(desc(count()))
    .limit(Math.min(limit, 50));
  return rows.map((row) => ({ method: row.method, count: row.count }));
}

/**
 * The filter dropdowns' options, in one pass rather than one scan per list.
 *
 * Scoped to the same window the page is showing: these are unbounded `DISTINCT`
 * reads otherwise, growing with the table forever to populate a dropdown.
 */
export async function filterOptions(options: AuditQuery = {}): Promise<{
  resources: string[];
  verbs: string[];
  authMethods: string[];
  applications: { id: string; name: string }[];
}> {
  const where = predicate(options);
  const [resources, verbs, authMethods, applications] = await Promise.all([
    db()
      .selectDistinct({ value: auditLog.resource })
      .from(auditLog)
      .where(where)
      .orderBy(asc(auditLog.resource)),
    db()
      .selectDistinct({ value: auditLog.verb })
      .from(auditLog)
      .where(where)
      .orderBy(asc(auditLog.verb)),
    db()
      .selectDistinct({
        value: sql<string>`${auditLog.context}->>'authMethod'`,
      })
      .from(auditLog)
      .where(and(where, sql`${auditLog.context}->>'authMethod' IS NOT NULL`))
      .orderBy(asc(sql`1`)),
    db()
      .selectDistinct({
        id: auditLog.applicationId,
        name: auditLog.applicationName,
      })
      .from(auditLog)
      .where(and(where, sql`${auditLog.applicationId} IS NOT NULL`))
      .orderBy(asc(auditLog.applicationName)),
  ]);

  return {
    resources: resources.map((row) => row.value),
    verbs: verbs.map((row) => row.value),
    authMethods: authMethods.map((row) => row.value),
    applications: applications.map((row) => ({
      id: row.id ?? "",
      name: row.name ?? row.id ?? "",
    })),
  };
}
