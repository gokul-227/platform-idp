import { sql } from "drizzle-orm";
import {
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Append-only record of who did what, in the shape platform's `audit_log` uses:
 * no update and no delete, since an editable row answers a different question. It
 * adds an actor snapshot (no user table here), a `status`, and the application an
 * event happened through.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    /**
     * The canonical actor reference, stable for the identity's lifetime unlike an
     * email, and null for an unauthenticated attempt. No foreign key is possible:
     * the identity lives in Kratos's schema and the row outlives the account.
     */
    actorIdentityId: text("actor_identity_id"),
    /** Point-in-time snapshots, not a live join. See the note above. */
    actorEmail: text("actor_email"),
    actorName: text("actor_name"),
    actorType: text("actor_type").notNull().default("user"),

    /** What it happened to, and what that thing was called at the time. */
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    resourceLabel: text("resource_label"),
    /** What happened, past tense: created, revoked, granted. */
    verb: text("verb").notNull(),

    organization: text("organization"),
    /** success | failure | denied. Enforced in TypeScript at the one place
     *  events are written, not by a CHECK constraint. */
    status: text("status").notNull().default("success"),

    /** The OAuth client the event happened through, when one was involved.
     *  Null for a console-native action — an honest absence. */
    applicationId: text("application_id"),
    applicationName: text("application_name"),

    /**
     * Facts about the call rather than about the change: ip, userAgent,
     * requestId, sessionId, authMethod. Read through the GIN index below.
     */
    context: jsonb("context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * What moved, as `before`/`after` where there is a diff to show, so a
     * reader renders one without knowing the resource.
     */
    payload: jsonb("payload").$type<Record<string, unknown>>(),

    /** Own columns rather than context keys: every list read filters on
     *  these, and a jsonb path cannot use a btree index. */
    ip: inet("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    sessionId: text("session_id"),
  },
  (table) => [
    index("idx_audit_created_at").on(table.createdAt.desc()),
    // Partial, like platform's: a null never matches these filters, so the
    // rows holding one do not belong in the index.
    index("idx_audit_resource")
      .on(table.resource, table.resourceId, table.createdAt.desc())
      .where(sql`${table.resourceId} IS NOT NULL`),
    index("idx_audit_verb").on(table.verb, table.createdAt.desc()),
    index("idx_audit_actor")
      .on(table.actorIdentityId, table.createdAt.desc())
      .where(sql`${table.actorIdentityId} IS NOT NULL`),
    index("idx_audit_organization")
      .on(table.organization, table.createdAt.desc())
      .where(sql`${table.organization} IS NOT NULL`),
    index("idx_audit_session")
      .on(table.sessionId, table.createdAt.desc())
      .where(sql`${table.sessionId} IS NOT NULL`),
    index("idx_audit_application")
      .on(table.applicationId, table.createdAt.desc())
      .where(sql`${table.applicationId} IS NOT NULL`),
    index("idx_audit_context").using("gin", table.context),
  ]
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
