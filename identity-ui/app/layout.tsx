import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/providers/theme-provider";
import { loadTheme } from "@/themes/load-theme";

// Metadata is a function, not a static object, specifically so the theme
// (and thus the page title/favicon) comes from config/themes/neobim.yaml at
// request time, not from a value baked in at build time.
export async function generateMetadata(): Promise<Metadata> {
  const theme = loadTheme();
  return {
    title: theme.productName,
    description:
      "Renders Ory Kratos/Hydra self-service flows. Contains no authentication logic of its own.",
    icons: { icon: theme.favicon },
  };
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const theme = loadTheme();
  return (
    <html lang="en">
      <body>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
