import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { auditLog } from "./audit.table";

/** The tables this handle knows about. */
const schema = { auditLog };

/**
 * One pool per process. Next reloads modules in dev, so a module-level pool
 * alone leaks one per reload until Postgres refuses connections; the global
 * keeps a single one across reloads.
 */
declare global {
  var __platformIdPool: Pool | undefined;
}

/**
 * The identity estate's own database, named for the estate that owns it rather
 * than for the first table in it. A per-slice override is read before the shared
 * URL, for the day a slice moves onto its own instance; the migrator honours the
 * same pair. The default is the compose stack's, so a checkout needs no `.env`.
 */
const LOCAL_DSN = "postgres://id_app_role:dev@127.0.0.1:5434/identity";

/** Exported so the migrator resolves exactly what the reader will connect to;
 *  two copies of this would be two answers. */
export /**
 * Modes libpq treats as "encrypt, and do not check who you are talking to".
 * `pg` from 8.16 reads all three as `verify-full` instead.
 */
const LIBPQ_WEAK_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

/**
 * Restores libpq's reading of `sslmode` for this client: `pg` 8.16 reads the
 * DSN's `require` as `verify-full`, which fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE against a CA Node does not ship. Set here and
 * not in the DSN, which Ory also parses. Not a downgrade: `require` never meant
 * verified.
 */
function withLibpqSslSemantics(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL this can reason about; hand it back untouched rather than
    // refuse to connect over a parse this does not need to do.
    return url;
  }
  const mode = parsed.searchParams.get("sslmode");
  if (!(mode && LIBPQ_WEAK_SSL_MODES.has(mode))) {
    return url;
  }
  if (parsed.searchParams.has("uselibpqcompat")) {
    return url;
  }
  parsed.searchParams.set("uselibpqcompat", "true");
  return parsed.toString();
}

export function connectionString(): string {
  return withLibpqSslSemantics(
    process.env.AUDIT_DATABASE_URL ?? process.env.DATABASE_URL ?? LOCAL_DSN
  );
}

export function pool(): Pool {
  if (!globalThis.__platformIdPool) {
    globalThis.__platformIdPool = new Pool({
      connectionString: connectionString(),
      // Small: every consumer is a short-lived server action, and Cloud SQL
      // charges connections against a per-instance limit shared with Ory.
      // Sized against the widest read on the audit page, which issues its
      // queries together rather than in turn.
      max: 12,
    });
  }
  return globalThis.__platformIdPool;
}

/** The drizzle handle every repository in this package queries through. */
export function db(): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(pool(), { schema });
}
