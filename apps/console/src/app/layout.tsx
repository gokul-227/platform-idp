import { fontVariables } from "@aec-craft/ui/fonts";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "buildOS console",
  robots: { index: false, follow: false },
};

/**
 * Document only. The sidebar shell lives in `(console)/layout.tsx`, because
 * `/denied` renders outside the gate and must not offer navigation into pages
 * the visitor is not allowed to open.
 */
export default function Layout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html className={fontVariables} lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
