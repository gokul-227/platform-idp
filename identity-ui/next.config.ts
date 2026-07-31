import type { NextConfig } from "next";

// Same-origin-only CSP: this app never embeds third-party scripts/styles/
// frames, and it must never itself be framed (X-Frame-Options: DENY) since
// it renders the login/registration/settings/admin-console surfaces —
// clickjacking those is a real credential-theft vector. 'unsafe-inline' on
// script-src/style-src is required for Next.js's own hydration script and
// styled-jsx output; replacing it with a nonce/strict-dynamic policy is a
// further hardening step not implemented in this pass (disclosed, not
// hidden — see docs/07-operations/README.md).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Served behind Oathkeeper at /auth/* (see ory/oathkeeper/rules/
  // access-rules.json's auth-ui-rules). Without this, every asset Next
  // itself references (`<link href="/_next/static/...">`,
  // `<script src="/_next/...">`) is generated as a DOMAIN-ROOT-absolute
  // path — the browser requests /_next/static/... directly, which has no
  // /auth prefix and doesn't match any Oathkeeper rule, so it 404s. This is
  // exactly what was happening: the page's *server-rendered HTML* loaded
  // fine (it matched /auth/*), but every CSS/JS asset it referenced failed
  // silently, so the browser rendered completely unstyled, non-hydrated
  // markup — confirmed live via curl (curl "guessing" the /auth prefix on
  // an asset URL succeeded; requesting the exact literal href from the
  // page, with no prefix, 404'd). `basePath` makes Next itself generate and
  // route every internal URL — pages, assets, redirects — with /auth
  // already prepended, which is why Oathkeeper's rule for this path no
  // longer strips it (see access-rules.json's comment on auth-ui-rules).
  basePath: "/auth",
  // No transpilePackages/externalDir here (unlike applications/neobim/neobim-ui) —
  // this app doesn't actually import @aec-craft/ui as a live module
  // anywhere; components are vendored (components/vendor/ui/, see
  // button.tsx's comment) and the theme CSS is a synced local copy
  // (app/globals.css). The `@aec-craft/ui` package.json dependency is kept
  // only as a documented intent to switch back to a live import once
  // Turbopack's file:-dependency resolution bug is fixed upstream.
};

export default nextConfig;
