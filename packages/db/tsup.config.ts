import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    audit: "src/audit.repository.ts",
    "audit.table": "src/audit.table.ts",
    client: "src/client.ts",
    migrate: "src/migrate.ts",
    "migrate.cli": "src/migrate.cli.ts",
  },
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "es2023",
  treeshake: true,
  // pg opens sockets and reads files through its own resolution; bundling it
  // breaks that. drizzle-orm stays external so one copy backs both the schema
  // this package exports and any query a consumer builds against it.
  external: ["pg", "drizzle-orm"],
});
