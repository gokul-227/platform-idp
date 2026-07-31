// Outer page shell for login/registration/recovery/verification — matches
// .reference/platform-ory-id-spike/apps/id/src/app/(flows)/layout.tsx's
// exact composition (logo above a centered, width-capped column) with the
// logo swapped for the theme-driven Lockup instead of a hardcoded brand
// mark. The Card itself stays in each page (via components/auth-shell.tsx)
// — this layout only owns the page-level chrome, same separation as the
// reference.

import type { ReactNode } from "react";

import { Lockup } from "@/components/lockup";
import { loadTheme } from "@/themes/load-theme";

export default function FlowsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const theme = loadTheme();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <Lockup theme={theme} />
      {children}
    </main>
  );
}
