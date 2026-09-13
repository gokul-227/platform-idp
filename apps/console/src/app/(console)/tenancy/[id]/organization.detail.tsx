"use client";

import {
  useAdminMembers,
  useAdminOrg,
  useAdminOrgProjects,
} from "@aec-craft/platform-admin-sdk/react";
import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { PlatformError } from "@aec-craft/platform-sdk";
import { SectionLoading } from "@aec-craft/ui/components/blocks/section";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page.header";
import { QueryError } from "@/components/query.error";
import { MembersTable } from "./members/member.table";
import { OrganizationMenu } from "./organization.menu";

/**
 * One organization, the operator view: what it is and who is in it, read as the
 * operator through the relay. The internal id sits under the title, where an
 * application already carries its client id: an operator answering a support
 * question needs it to grep a log.
 */
export function OrganizationDetail({ orgId }: { orgId: string }): ReactNode {
  const org = useAdminOrg(orgId);
  const members = useAdminMembers(orgId);
  const projects = useAdminOrgProjects(orgId);

  if (org.error instanceof PlatformError && org.error.statusCode === 404) {
    notFound();
  }
  if (org.isPending) {
    return (
      <div className="p-6">
        <SectionLoading />
      </div>
    );
  }
  if (org.error) {
    return (
      <div className="p-6">
        <QueryError
          error={org.error}
          onRetry={() => void org.refetch()}
          subject="this organization"
        />
      </div>
    );
  }
  const updatedAt = new Date(org.data.updatedAt);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        actions={
          <OrganizationMenu
            name={org.data.name}
            orgId={orgId}
            slug={org.data.slug}
          />
        }
        back={{ href: "/tenancy", label: "Organizations" }}
        description={`${org.data.slug} · ${org.data.id}`}
        title={org.data.name}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Members"
          value={members.data ? `${members.data.total}` : "—"}
        />
        <Stat
          label="Projects"
          value={
            projects.data
              ? `${projects.data.total ?? projects.data.items.length}`
              : "—"
          }
        />
        <Stat
          label="Last changed"
          note={formatDate(updatedAt)}
          value={relativeSince(updatedAt)}
        />
      </div>

      <MembersTable orgId={orgId} />
    </div>
  );
}

/** The audit page's own tile, so a figure reads the same wherever the console
 *  shows one. */
function Stat({
  label,
  note,
  value,
}: {
  label: string;
  note?: string | null;
  value: string;
}): ReactNode {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="font-semibold text-3xl tabular-nums tracking-tight">
          {value}
        </span>
        {note ? (
          <p className="mt-1 text-muted-foreground text-xs">{note}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** "3 days ago" over the timestamp: the figure a tile shows should be readable
 *  at a glance, with the exact instant under it. */
function relativeSince(value: Date): string {
  const days = Math.floor((Date.now() - value.getTime()) / 86_400_000);
  if (days <= 0) {
    return "Today";
  }
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
