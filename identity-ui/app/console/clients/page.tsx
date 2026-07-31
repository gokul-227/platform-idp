import { redirect } from "next/navigation";
import type { ReactNode } from "react";

// The standalone Clients LIST page was merged into /console/applications
// ("Application Integrations" — one unified table over both registry-
// backed applications and raw Hydra clients, see
// ../applications/page.tsx's header comment for the full merge rationale).
// This route stays as a redirect rather than a 404 so any existing
// bookmark/link keeps working. The per-client DETAIL page
// (/console/clients/[clientId]) and its create/rotate/delete actions
// (./actions.ts) are UNCHANGED and still real — the merged table's "raw
// client" rows link straight to them.
export default function ClientsPage(): ReactNode {
  redirect("/console/applications");
}
