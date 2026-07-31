import type { ReactNode } from "react";

import type { ParsedUserAgent } from "@/lib/user-agent";

// Minimal inline SVGs — no icon library dependency added for two glyphs.
export function DeviceIcon({ deviceType }: { deviceType: ParsedUserAgent["deviceType"] }): ReactNode {
  if (deviceType === "mobile") {
    return (
      <svg aria-hidden="true" className="size-5 text-muted-foreground" fill="none" viewBox="0 0 24 24">
        <rect height="18" rx="2" stroke="currentColor" strokeWidth="1.5" width="12" x="6" y="3" />
        <line stroke="currentColor" strokeWidth="1.5" x1="10" x2="14" y1="18" y2="18" />
      </svg>
    );
  }
  if (deviceType === "unknown") {
    return (
      <svg aria-hidden="true" className="size-5 text-muted-foreground" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 1.8-2 3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
        <circle cx="12" cy="16.5" fill="currentColor" r="0.75" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="size-5 text-muted-foreground" fill="none" viewBox="0 0 24 24">
      <rect height="12" rx="1" stroke="currentColor" strokeWidth="1.5" width="18" x="3" y="4" />
      <line stroke="currentColor" strokeWidth="1.5" x1="8" x2="16" y1="20" y2="20" />
      <line stroke="currentColor" strokeWidth="1.5" x1="12" x2="12" y1="16" y2="20" />
    </svg>
  );
}
