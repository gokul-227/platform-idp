import type { ReactNode } from "react";

import { loadTheme } from "@/themes/load-theme";
import { ConsoleNav } from "./console.nav";

/**
 * Admin Portal — separate persona from the (flows)/(account) User Portal.
 * Access control (real Kratos session + Organization:platform#admin in
 * Keto — see PLATFORM_ORGANIZATION_ID in platform/hooks/keto_client.py) is
 * enforced entirely in middleware.ts, not here. An earlier version of this
 * layout did the check inline and rendered a 403 branch instead of
 * `children` — that does NOT stop the actual page component from running:
 * Next's App Router executes every matched page.tsx regardless of what the
 * layout does with the result, so the real Overview page's live admin API
 * data (identity counts, emails) was still being serialized into the RSC
 * response body even while the visible DOM showed "403". Middleware runs
 * before routing/rendering starts, so an unauthorized request never
 * reaches any /console page component at all — this layout can now assume
 * whoever reaches it is already an authenticated platform admin.
 *
 * Layout itself simplified from .reference/platform-ory-id-spike/apps/id/
 * src/app/console/layout.tsx: that version uses the full shadcn Sidebar
 * primitive (collapsible, mobile drawer, cookie-persisted state — ~700
 * lines); this is a plain static two-column layout, a deliberate scope cut
 * still true here — sticky positioning and spacing below are a consistency
 * pass, not an adoption of that primitive.
 *
 * `min-w-0` on the content column is load-bearing, not decorative: a flex
 * item's default min-width is `auto`, which lets a wide child (e.g. a data
 * table with many columns) grow the column — and the whole page — wider
 * than the viewport instead of scrolling inside its own box. Without it,
 * every console page with a table intermittently overflowed past the
 * sidebar depending on content width.
 */
export default function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const theme = loadTheme();
  return (
    <div className="flex min-h-dvh w-full overflow-x-hidden">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r px-4 py-5">
        <div className="flex items-baseline gap-2 px-1">
          <span className="font-heading font-medium text-base">
            {theme.companyName}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
            console
          </span>
        </div>
        <ConsoleNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">{children}</div>
    </div>
  );
}
