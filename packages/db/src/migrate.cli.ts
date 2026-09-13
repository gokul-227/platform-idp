import { connectionString } from "./client";
import { migrate } from "./migrate";

/**
 * `audit-migrate` — run before deploying a revision that reads the audit log.
 *
 * The database itself is created by infrastructure (`infra/modules/cloud-sql`,
 * and `ory/postgres/init-db.sql` locally), never here: creating one needs a
 * privilege a runtime identity should not hold.
 *
 * Wrapped rather than awaited at the top level, because this file is also
 * built to CJS, which has no top-level await.
 */
async function main(): Promise<void> {
  // Resolved by the client, so the migrator can only ever apply to the database
  // a reader would then connect to.
  await migrate(connectionString());
  console.log("audit migrations applied");
}

main().catch((error) => {
  console.error("audit migrations failed", error);
  process.exit(1);
});
