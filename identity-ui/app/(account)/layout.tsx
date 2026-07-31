// Wider column than (flows)'s auth cards — settings is a page you browse,
// not a modal-shaped form. Matches
// .reference/platform-ory-id-spike/apps/id/src/app/(account)/layout.tsx's
// exact split (same logo, wider max-width) — see app/(flows)/layout.tsx for
// the narrower sibling.

import type { ReactNode } from "react";

import { Lockup } from "@/components/lockup";
import { loadTheme } from "@/themes/load-theme";

export default function AccountLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const theme = loadTheme();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <Lockup theme={theme} />
      {children}
    </main>
  );
}
