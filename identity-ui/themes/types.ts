// The theme contract. Deliberately lives here, not in platform/ or ory/*
// (see docs/10-reference/plugin-architecture.md: "Branding belongs in the
// UI project's own theming, never in platform services"). One theme object
// today (themes/neobim.ts); a per-tenant theme registry is explicitly
// deferred (see neobim-plugin-architecture-proposal.md §3) until a real
// second theme exists — matching this repo's own "no stub plugins" rule.

export interface Theme {
  productName: string;
  companyName: string;
  logo: {
    /** Path under public/, or a full URL. */
    src: string;
    alt: string;
  };
  favicon: string;
  colors: {
    background: string;
    foreground: string;
    accent: string;
    accentForeground: string;
    border: string;
  };
  typography: {
    fontFamily: string;
  };
  footer: {
    text: string;
    links: Array<{ label: string; href: string }>;
  };
}
