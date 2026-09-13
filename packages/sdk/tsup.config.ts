import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/session.client.ts", identity: "src/identity.ts" },
  format: ["esm", "cjs"],
  // `resolve` inlines the contracts types into the rolled-up .d.ts. Without it
  // the declarations import a package no install of this one could resolve,
  // because contracts is private.
  dts: { resolve: [/^@aec-craft\/platform-id-contracts/] },
  clean: true,
  sourcemap: true,
  target: "es2023",
  treeshake: true,
  // Contracts is deliberately not listed: private, so it is bundled in.
  external: ["@ory/client-fetch"],
});
