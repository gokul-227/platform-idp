/**
 * What the audit feed can be narrowed by. The vocabulary lives here and the SQL
 * with the table, so a surface names a filter and never spells a column or grows
 * its own `WHERE`. `field` is the entity field, not the column: the two may
 * differ, and the mapping belongs to whoever owns the table. Ops follow the
 * PostgREST vocabulary the platform API exposes.
 */
export type AuditFilterOp = "eq" | "in" | "contains" | "gte" | "lt" | "search";

export interface AuditFilterSpec {
  /** `search` only: the fields the term is matched against. */
  readonly across?: readonly string[];
  readonly description: string;
  readonly field: string;
  readonly op: AuditFilterOp;
}

/**
 * The fields a free-text search covers: what an operator pastes from a ticket or
 * reads off a screen, not every column, since a term matched across everything
 * returns rows whose connection to it nobody can see.
 */
const SEARCH_ACROSS = [
  "actorEmail",
  "actorName",
  "actorIdentityId",
  "resourceLabel",
  "resourceId",
  "applicationName",
  "sessionId",
  "requestId",
] as const;

export const AUDIT_FILTERS = {
  resource: {
    field: "resource",
    op: "eq",
    description:
      "Filter by resource type (application, identity, session, ...).",
  },
  verb: {
    field: "verb",
    op: "eq",
    description: "Filter by verb (created, updated, revoked, ...).",
  },
  status: {
    field: "status",
    op: "eq",
    description: "Filter by result (success, failure, denied).",
  },
  actorId: {
    field: "actorIdentityId",
    op: "eq",
    description: "Filter by the acting identity's id.",
  },
  actor: {
    field: "actor",
    op: "contains",
    description: "Filter by the actor's recorded email, name or id.",
  },
  resourceId: {
    field: "resourceId",
    op: "eq",
    description: "Filter by the affected row's id.",
  },
  resourceLabel: {
    field: "resourceLabel",
    op: "contains",
    description:
      "Filter by the subject's recorded name. Rows written before a name was captured hold null and match neither.",
  },
  applicationId: {
    field: "applicationId",
    op: "eq",
    description: "Filter by the OAuth client the event happened through.",
  },
  sessionId: {
    field: "sessionId",
    op: "eq",
    description: "Filter by the session the event happened under.",
  },
  requestId: {
    field: "requestId",
    op: "eq",
    description: "Filter by request id — correlates one HTTP call's rows.",
  },
  eventId: {
    field: "id",
    op: "eq",
    description: "Filter by the event's own id.",
  },
  ip: {
    field: "ip",
    op: "contains",
    description:
      "Filter by caller IP. Substring, so a partial address is useful against a shared egress.",
  },
  authMethod: {
    field: "authMethod",
    op: "eq",
    description:
      "Filter by how the actor authenticated, from the event's context.",
  },
  organization: {
    field: "organization",
    op: "eq",
    description: "Filter by organization.",
  },
  after: {
    field: "createdAt",
    op: "gte",
    description: "Only events at or after this instant.",
  },
  search: {
    field: "search",
    op: "search",
    across: SEARCH_ACROSS,
    description:
      "Substring across actor, subject, application and correlation ids.",
  },
} as const satisfies Record<string, AuditFilterSpec>;

export type AuditFilterName = keyof typeof AUDIT_FILTERS;

/**
 * Offset paging with a total, not a cursor: the console renders numbered
 * pages, which needs a count. `platform`'s feed defaults to cursor because it
 * is also tailed by API consumers; this one has a single reader.
 */
export const AUDIT_LIST = {
  defaultSort: "createdAt:desc",
  defaultLimit: 50,
  maxLimit: 200,
} as const;

/** The buckets the activity trend can be grouped into, matching `date_trunc`'s
 *  own vocabulary so nothing translates between the two. */
export const AUDIT_TREND_BUCKETS = ["minute", "hour", "day", "week"] as const;
export type AuditTrendBucket = (typeof AUDIT_TREND_BUCKETS)[number];
