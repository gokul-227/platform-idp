"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Overview/Identities/Sessions/Clients/Permissions started as a byte-for-
// byte match of .reference/platform-ory-id-spike/apps/id's nav — that
// reference is architectural inspiration only now, not something this repo
// clones page-for-page. No routes were removed or renamed in this pass
// (tech-lead ask: focus current work on Overview/Identities/Applications/
// Audit Logs without restructuring navigation) — this only groups the same
// flat list into labeled sections for spacing/scannability, matching the
// spike's section-per-concern layout without adopting its full Sidebar
// primitive (collapsible/drawer/cookie-persisted state — a bigger surface
// than this pass's scope).
const GROUPS = [
  {
    label: null,
    items: [
      { href: "/console", label: "Overview" },
      { href: "/console/identities", label: "Identities" },
      { href: "/console/applications", label: "Application Integrations" },
      { href: "/console/audit", label: "Audit Logs" },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/console/organizations", label: "Organizations" },
      { href: "/console/groups", label: "Groups" },
      // Sessions removed from here deliberately: it's the ALL-IDENTITIES
      // admin session list (revoke anyone's session), which is a real,
      // distinct surface from the per-user "Devices" card already on each
      // person's own Account Settings page (components/sessions-section.tsx)
      // — not a duplicate. The route (/console/sessions) and its own
      // detail/revoke actions are UNCHANGED and still reachable directly;
      // only the top-level nav entry was removed, per the explicit ask to
      // de-emphasize a cross-identity admin surface that isn't part of the
      // initial feature set's primary navigation.
    ],
  },
  {
    label: "Access control",
    items: [
      // Clients removed from here deliberately: its list view merged into
      // Application Integrations above (one unified table over registry
      // apps + raw Hydra clients — see applications/page.tsx's header
      // comment). /console/clients still exists as a route (redirects
      // here) and /console/clients/[clientId]'s detail/edit page is
      // unchanged and linked directly from the merged table's "raw
      // client" rows.
      { href: "/console/permissions", label: "Permissions" },
      { href: "/console/roles", label: "Roles" },
      { href: "/console/policies", label: "Policies" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/console/identity-providers", label: "Identity Providers" },
      { href: "/console/plugins", label: "Plugins" },
      { href: "/console/themes", label: "Themes" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/console/reports", label: "Reports" },
      { href: "/console/developer", label: "Developer Portal" },
      { href: "/console/notifications", label: "Notifications" },
      { href: "/console/settings", label: "Settings" },
      // Not a /console/* route — the flow-rendering UI at /auth/* (login,
      // registration, account settings). Kept as a real nav item per the
      // requested grouping rather than a separate pinned aside link (see
      // layout.tsx, where the old standalone link was removed).
      { href: "/auth", label: "Flow UI" },
    ],
  },
] as const;

export function ConsoleNav(): ReactNode {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    return href === "/console" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <nav className="flex flex-col gap-4">
      {GROUPS.map((group, index) => (
        <div className="flex flex-col gap-0.5" key={group.label ?? `primary-${index}`}>
          {group.label ? (
            <span className="mt-1 px-3 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              {group.label}
            </span>
          ) : null}
          {group.items.map((item) => (
            <Link
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
