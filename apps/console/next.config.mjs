import { join } from "node:path";

/**
 * Baseline security headers for an identity surface. No CSP: a policy worth
 * having needs a nonce on Next's inlined bootstrap scripts and on the design
 * system's inline styles, and neither is wired up here. One added without that
 * either breaks the app or degrades to `unsafe-inline`, which buys nothing.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

/**
 * Stated, not inferred: Turbopack picks the workspace root from the first
 * lockfile above it, which in a worktree is the main checkout's, and the graph
 * then watches the other tree and renames chunks under an open tab
 * (ChunkLoadError with no bad code behind it). Derived from this file's location,
 * so it holds in every worktree.
 */
const workspaceRoot = join(import.meta.dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: workspaceRoot },
  output: "standalone",
  // Both ship raw .tsx/.ts (source exports), so Next must transpile them.
  transpilePackages: ["@aec-craft/platform-id-contracts", "@aec-craft/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
