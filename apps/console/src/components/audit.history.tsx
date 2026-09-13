import {
  auditActionLabel,
  auditStatusLabel,
} from "@aec-craft/platform-id-contracts/audit/audit.labels";
import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import type { AuditEvent } from "@aec-craft/platform-id-db/audit";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import Link from "next/link";
import type { ReactNode } from "react";
import { itemLabel } from "@/lib/audit.event";
import { AUDIT_STATUS_BADGE, UNKNOWN_STATUS } from "@/lib/status.badge";

function HistoryRow({ event }: { event: AuditEvent }): ReactNode {
  const target = itemLabel(event);
  return (
    <li className="border-rule border-b last:border-0">
      {/* The whole row, because every event has a page and finding it again
          through /audit is the long way round. */}
      <Link
        className="-mx-2 flex items-start justify-between gap-4 rounded px-2 py-2 hover:bg-muted/50"
        href={`/audit/${event.id}`}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm">{auditActionLabel(event)}</span>
          <span className="truncate text-muted-foreground text-xs">
            {event.actorName ?? event.actorEmail ?? "System"}
            {target === "—" ? "" : ` → ${target}`}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* The same variant the audit table uses: a denial read as neutral here
            and destructive there, for the same event. */}
          {event.status === "success" ? null : (
            <Badge {...(AUDIT_STATUS_BADGE[event.status] ?? UNKNOWN_STATUS)}>
              {auditStatusLabel(event.status)}
            </Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {formatDate(event.createdAt)}
          </span>
        </div>
      </Link>
    </li>
  );
}

/**
 * The condensed "what happened here" card every detail page embeds, as one
 * component so the Activity tabs cannot drift apart. Deliberately narrow: recent
 * rows and a link to /audit, which is the filterable table this previews.
 */
export function AuditHistory({
  events,
  total,
  viewAllHref,
  empty = "No recorded activity yet.",
  title = "Recent activity",
}: {
  empty?: string;
  events: AuditEvent[];
  title?: string;
  total: number;
  /** Where "View all" points — a pre-filtered /audit URL. */
  viewAllHref: string;
}): ReactNode {
  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {total > 0 ? (
          <Link
            className="text-muted-foreground text-xs hover:text-foreground hover:underline"
            href={viewAllHref}
          >
            View all {total}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="flex flex-col">
            {events.map((event) => (
              <HistoryRow event={event} key={event.id} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
