import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as runMigrations } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/**
 * Applies the generated drizzle migrations in `drizzle/`. Journals into its own
 * table rather than drizzle's default, so several slices can migrate one database
 * without sharing a ledger; the name is not free to change later. A dedicated
 * `Client` rather than the pool: one connection, handed back.
 */
const MIGRATIONS_TABLE = "__drizzle_migrations_audit";
const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle"
);

export async function migrate(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await runMigrations(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    await client.end();
  }
}
