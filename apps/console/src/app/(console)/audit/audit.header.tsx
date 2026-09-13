import type { ReactNode } from "react";
import { PageHeader } from "@/components/page.header";

export type AuditView = "logs" | "analytics";

/**
 * The header both audit views share; switching between them is a sidebar matter,
 * so `view` only decides the sentence under the title.
 */
export function AuditHeader({
  actions,
  view,
}: {
  actions?: ReactNode;
  view: AuditView;
}): ReactNode {
  const isAnalytics = view === "analytics";
  return (
    <PageHeader
      actions={actions}
      description={
        isAnalytics
          ? "Patterns across the selected range."
          : "What happened, and who did it."
      }
      title={isAnalytics ? "Audit analytics" : "Audit logs"}
    />
  );
}
