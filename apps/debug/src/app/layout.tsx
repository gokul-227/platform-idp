import { fontVariables } from "@aec-craft/ui/fonts";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Guard example",
  robots: { index: false, follow: false },
};

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
