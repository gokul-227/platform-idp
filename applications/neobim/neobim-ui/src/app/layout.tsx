import { fontVariables } from "@/lib/fonts";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

// Structure copied from platform-neobim/apps/auth/src/app/layout.tsx — same
// design-system fonts/shell. The Toaster is dropped: no page in this app
// triggers a toast, and ui-neobim's Toaster needs a next-themes provider
// this minimal app doesn't otherwise need.
export const metadata: Metadata = {
  title: "NeoBIM",
};

export default function Layout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html className={fontVariables} lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
