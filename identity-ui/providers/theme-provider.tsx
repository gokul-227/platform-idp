"use client";

// Milestone 3: makes the active Theme (themes/neobim.ts) available to any
// client component (footer links, logo, product name) without threading it
// through props. Server components (the flow pages) read the theme object
// directly by importing it — this provider only matters for client-side
// consumers, of which there are none yet at Milestone 4, but the layout
// wires it now so a future second theme just means picking which Theme this
// provider is constructed with (see neobim-plugin-architecture-proposal.md
// §3 for why that selection mechanism isn't built until a second theme
// actually exists).

import { createContext, type ReactNode, useContext } from "react";

import type { Theme } from "@/themes/types";

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}): ReactNode {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme() called outside <ThemeProvider>");
  }
  return theme;
}
