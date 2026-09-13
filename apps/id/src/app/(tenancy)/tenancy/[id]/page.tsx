import { auditActionLabel } from "@aec-craft/platform-id-contracts/audit/audit.labels";
import { listEvents } from "@aec-craft/platform-id-db/audit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import type { ReactNode } from "react";
import { platformGate } from "@/lib/platform.user";
import { PlatformUnavailable } from "../platform.unavailable";
import { formatEventTime } from "./format";
import { OrganizationDetail } from "./organization.detail";

export const dynamic = "force-dynamic";

/**
 * One organization: who reaches it and what has happened to it. Keyed by
 * platform's org id, which the audit scope and the console's routes use too, so
 * a link from either app lands in the same place. The activity feed is this
 * repo's own audit log and is read here; everything platform's is read in the
 * browser as the person.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { id } = await params;
  const orgId = decodeURIComponent(id);
  const gate = await platformGate(
    `/tenancy/${encodeURIComponent(orgId)}`,
    await searchParams
  );
  if ("unavailable" in gate) {
    return <PlatformUnavailable reason={gate.unavailable} />;
  }
  // A feed that cannot be read costs the section, never the page.
  const activity = await listEvents({ limit: 5, organization: orgId }).catch(
    () => ({ events: [], total: 0 })
  );

  return (
    <OrganizationDetail orgId={orgId}>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription className="text-sm/relaxed">
            Configuration changes and sign-ins for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col">
              {activity.events.map((event) => (
                <li
                  className="flex items-center gap-3 border-rule border-b py-3 text-sm first:pt-0 last:border-b-0 last:pb-0"
                  key={event.id}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {auditActionLabel(event)}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {formatEventTime(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </OrganizationDetail>
  );
}
