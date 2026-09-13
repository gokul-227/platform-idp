import { fontVariables } from "@aec-craft/ui/fonts";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  // The tab says what the wordmark on the page says. `apps/id` serves two
  // surfaces, so `(account)` overrides this for its own segment.
  title: "buildOS ID",
  robots: { index: false, follow: false },
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
