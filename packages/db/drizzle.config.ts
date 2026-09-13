import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/audit.table.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.AUDIT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgres://id_app_role:dev@127.0.0.1:5434/identity",
  },
});
