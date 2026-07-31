import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // @aec-craft/ui ships raw .tsx/.ts source exports (no build step of its
  // own) — Next must transpile it itself, same as
  // applications/neobim-identity-ui/next.config.ts.
  transpilePackages: ["@aec-craft/ui"],
  // @aec-craft/ui resolves OUTSIDE this app's own directory (a `file:` link
  // to the real, sibling `ui` repo, since the ui-neobim duplicate this
  // comment used to reference was removed — see docs/10-reference/
  // ai-handoff.md §1.21). Turbopack refuses to resolve module specifiers
  // outside the project root without this.
  experimental: {
    externalDir: true,
  },
  // Turbopack's CSS `@import` resolution flatly refuses to cross outside
  // its detected filesystem root even with externalDir set (confirmed live
  // in applications/neobim-identity-ui: "leaves the filesystem root" —
  // §1.21). Widening the root to the actual repo checkout root (a sibling
  // of Ory_IDP) makes the real `ui` repo legitimately inside the project
  // as far as Turbopack is concerned.
  turbopack: {
    root: path.resolve(__dirname, "../../../"),
  },
};

export default nextConfig;
