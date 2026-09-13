import {
  auditActionLabel,
  auditStatusLabel,
} from "@aec-craft/platform-id-contracts/audit/audit.labels";
import { formatTimestamp } from "@aec-craft/platform-id-contracts/common/format";
import { type AuditEvent, getEventById } from "@aec-craft/platform-id-db/audit";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuditHistory } from "@/components/audit.history";
import { PageHeader } from "@/components/page.header";
import { itemLabel } from "@/lib/audit.event";
import {
  listEventsForActor,
  listEventsForApplication,
  listEventsForResource,
  listEventsForSession,
} from "@/lib/audit.feed";
import { AUDIT_STATUS_BADGE, UNKNOWN_STATUS } from "@/lib/status.badge";
import {
  ActivitySummaryCard,
  AdditionalDetails,
  AuthenticationCard,
  ChangesCard,
  ReasonCard,
  RequestCard,
  TechnicalDetailsCard,
  UserCard,
} from "./audit.detail.cards";

/**
 * Related activity, correlated most specific first: same resource, else same
 * actor, else the session or application. The last two are what remains for an
 * event with neither, such as an anonymous console-access denial.
 */
async function loadRelatedActivity(
  event: AuditEvent
): Promise<{ events: AuditEvent[]; href: string; total: number }> {
  const empty = { events: [], total: 0 };
  if (event.resourceId) {
    const related = await listEventsForResource(
      event.resource,
      event.resourceId,
      6
    ).catch(() => empty);
    return {
      events: related.events.filter((e) => e.id !== event.id),
      href: `/audit?resource=${encodeURIComponent(event.resource)}&resourceId=${encodeURIComponent(event.resourceId)}`,
      total: related.total,
    };
  }
  if (event.actorIdentityId) {
    const related = await listEventsForActor(event.actorIdentityId, 6).catch(
      () => empty
    );
    return {
      events: related.events.filter((e) => e.id !== event.id),
      href: `/audit?actorId=${encodeURIComponent(event.actorIdentityId)}`,
      total: related.total,
    };
  }
  if (event.sessionId) {
    const related = await listEventsForSession(event.sessionId, 6).catch(
      () => empty
    );
    return {
      events: related.events.filter((e) => e.id !== event.id),
      href: "/audit",
      total: related.total,
    };
  }
  if (event.applicationId) {
    const related = await listEventsForApplication(
      event.applicationId,
      6
    ).catch(() => empty);
    return {
      events: related.events.filter((e) => e.id !== event.id),
      href: `/audit?application=${encodeURIComponent(event.applicationId)}`,
      total: related.total,
    };
  }
  return { events: [], href: "/audit", total: 0 };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) {
    notFound();
  }

  const item = itemLabel(event);
  const related = await loadRelatedActivity(event);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* The eyebrow that read "Audit Log" is gone: the back link above the
          title already says which list this came from. */}
      <PageHeader
        back={{ href: "/audit", label: "Audit logs" }}
        badges={
          <Badge {...(AUDIT_STATUS_BADGE[event.status] ?? UNKNOWN_STATUS)}>
            {auditStatusLabel(event.status)}
          </Badge>
        }
        description={formatTimestamp(event.createdAt)}
        title={auditActionLabel(event)}
      />

      <ActivitySummaryCard event={event} item={item} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UserCard event={event} />
        <RequestCard event={event} />
        <AuthenticationCard event={event} />
        <ChangesCard event={event} />
        <ReasonCard event={event} />
      </div>

      <AdditionalDetails
        context={event.context ?? {}}
        payload={event.payload ?? {}}
      />

      <TechnicalDetailsCard event={event} />

      <AuditHistory
        empty="No related activity recorded."
        events={related.events}
        title="Related activity"
        total={related.total}
        viewAllHref={related.href}
      />
    </div>
  );
}
