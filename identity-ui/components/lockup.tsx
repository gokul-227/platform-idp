// Theme-driven equivalent of .reference/platform-ory-id-spike's
// BuildOsLockup (@aec-craft/platform-ui/components/branding/buildos-lockup)
// — deliberately NOT reused directly: that component (and every file under
// ui/packages/ui/components/branding/) is buildOS's own hardcoded brand
// mark, and that package's own AGENTS.md is explicit that branding assets
// are product-specific, not reusable product UI. Since this platform's
// whole point is swappable branding (config/themes/*.yaml — see
// themes/load-theme.ts), the logo here is data from the active theme, not
// a hardcoded import. If a theme has no logo configured, falls back to the
// theme's plain product name as text — never a hardcoded mark.

import type { ReactNode } from "react";

import type { Theme } from "@/themes/types";

export function Lockup({ theme }: { theme: Theme }): ReactNode {
  // Text-only for now: config/themes/neobim.yaml's logo.src points at
  // /neobim-mark.svg, which doesn't exist yet as a real asset in public/ —
  // rendering a broken <img> would be worse than no image at all. Swap this
  // for an <img src={theme.logo.src}> once a real mark file is added; no
  // code change needed elsewhere, the theme contract already carries it.
  return (
    <div className="inline-flex items-center gap-2 self-start">
      <span className="font-heading font-medium text-base">
        {theme.companyName}
      </span>
    </div>
  );
}
