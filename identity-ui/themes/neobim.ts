// The one real theme (see themes/types.ts for why there's exactly one, not
// a registry, yet). Colors intentionally reference the same CSS custom
// properties @aec-craft/ui's own globals.css defines (--primary,
// --foreground, etc.) rather than hardcoding hex values, so this theme
// stays in sync with the design system's own token updates automatically.

import type { Theme } from "./types";

export const neobimTheme: Theme = {
  productName: "NeoBIM Identity",
  companyName: "NeoBIM",
  logo: {
    src: "/neobim-mark.svg",
    alt: "NeoBIM",
  },
  favicon: "/favicon.ico",
  colors: {
    background: "var(--background)",
    foreground: "var(--foreground)",
    accent: "var(--primary)",
    accentForeground: "var(--primary-foreground)",
    border: "var(--border)",
  },
  typography: {
    fontFamily: "var(--font-sans)",
  },
  footer: {
    text: `© ${new Date().getFullYear()} NeoBIM`,
    links: [],
  },
};
