"use client";

import {
  type GroupStanding,
  type MemberResponse,
  PlatformError,
  type ProjectResponse,
  STANDING_LABELS,
} from "@aec-craft/platform-sdk";
import {
  useMembers,
  useMyStandings,
  useOrg,
  useProjectsByOrg,
} from "@aec-craft/platform-sdk/react";
import { Header } from "@aec-craft/ui/components/blocks/header";
import { SectionLoading } from "@aec-craft/ui/components/blocks/section";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { CaretLeftIcon } from "@aec-craft/ui/icons";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { QueryError } from "@/components/query.error";
import { grantableStandings, rootStanding } from "@/lib/standings";
import { MembersView } from "./members/member.view";

/**
 * `read` is the gate: an admin, a manager and a viewer all belong here. Nothing
 * to read, or no organization, is the same not-found rather than a hint that one
 * exists. `children` is the server-rendered activity feed.
 */
export function OrganizationDetail({
  children,
  orgId,
}: {
  children: ReactNode;
  orgId: string;
}): ReactNode {
  const org = useOrg(orgId);
  const standings = useMyStandings(orgId);
  const root = standings.data ? rootStanding(standings.data.items) : undefined;
  const canRead = root?.permits.read ?? false;

  if (
    (org.error instanceof PlatformError && org.error.statusCode === 404) ||
    (standings.data && !canRead)
  ) {
    notFound();
  }
  if (org.isPending || standings.isPending) {
    return <SectionLoading />;
  }
  if (org.error || standings.error) {
    const failed = org.error ? org : standings;
    return (
      <QueryError
        error={failed.error}
        onRetry={() => void failed.refetch()}
        subject="this organization"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Header
        actions={
          root?.standing ? (
            <Badge variant="outline">{STANDING_LABELS[root.standing]}</Badge>
          ) : null
        }
        description={org.data.slug}
        title={
          // The way back is the name itself: one affordance where a caret above
          // the title and a title below it were two.
          <Link
            className="flex items-center gap-1 hover:underline"
            href="/tenancy"
          >
            <CaretLeftIcon className="size-4 text-muted-foreground" />
            {org.data.name}
          </Link>
        }
      />
      <MembersCard
        canManage={root?.permits.manage ?? false}
        grantable={root ? grantableStandings(root) : []}
        orgId={orgId}
      />
      <ProjectsCard orgId={orgId} />
      {children}
    </div>
  );
}

/** One read rendered into a card: loading, failed, or the body. */
function Loaded<T>({
  children,
  query,
  subject,
}: {
  children: (data: T) => ReactNode;
  query: UseQueryResult<T>;
  subject: string;
}): ReactNode {
  if (query.isPending) {
    return <SectionLoading />;
  }
  if (query.error) {
    return (
      <QueryError
        error={query.error}
        onRetry={() => void query.refetch()}
        subject={subject}
      />
    );
  }
  return children(query.data);
}

function MembersCard({
  canManage,
  grantable,
  orgId,
}: {
  canManage: boolean;
  grantable: GroupStanding[];
  orgId: string;
}): ReactNode {
  const members = useMembers({ orgId, type: "org" });
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
        <CardDescription className="text-sm/relaxed">
          People who reach this organization, and every project beneath it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Loaded query={members} subject="the members">
          {(page: { items: MemberResponse[] }) => (
            <MembersView
              canManage={canManage}
              grantable={grantable}
              members={page.items}
              orgId={orgId}
            />
          )}
        </Loaded>
      </CardContent>
    </Card>
  );
}

function ProjectsCard({ orgId }: { orgId: string }): ReactNode {
  // Scoped to the caller: the projects they may read, not every project in it.
  const projects = useProjectsByOrg(orgId, { sort: ["name:asc"] });
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Projects</CardTitle>
        <CardDescription className="text-sm/relaxed">
          The projects inside this organization that you can reach.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Loaded query={projects} subject="the projects">
          {(page: { items: ProjectResponse[] }) =>
            page.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No projects yet.</p>
            ) : (
              <ul className="flex flex-col">
                {page.items.map((project) => (
                  <li
                    className="flex items-center gap-3 border-rule border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                    key={project.id}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{project.name}</span>
                      <span className="truncate text-muted-foreground text-xs">
                        {project.slug}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Loaded>
      </CardContent>
    </Card>
  );
}
