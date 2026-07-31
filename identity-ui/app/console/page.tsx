import Link from "next/link";
import type { ReactNode } from "react";

import {
  displayName,
  formatDate,
  hydraAdmin,
  identityAdmin,
  identityTraits,
  listRelationTuples,
} from "@/adapters/admin";
import { listAuditEvents } from "@/adapters/audit-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/vendor/ui/card";
import { listInvitations, listTenants } from "@/adapters/tenant-service";
import { getEnv } from "@/config/env";
import { PageHeader } from "./page.header";

const QUICK_ACTIONS = [
  { href: "/console/identities", label: "View identities" },
  { href: "/console/organizations", label: "Create an organization" },
  { href: "/console/applications", label: "Register an application" },
  { href: "/console/settings/administrators", label: "Manage administrators" },
] as const;

async function serviceStatus(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function Kpi({ label, value }: { label: string; value: number }): ReactNode {
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
      </CardContent>
    </Card>
  );
}

function StatusBadge({ isUp }: { isUp: boolean }): ReactNode {
  return <Badge variant={isUp ? "outline" : "destructive"}>{isUp ? "ready" : "down"}</Badge>;
}

export default async function ConsoleOverviewPage(): Promise<ReactNode> {
  const env = getEnv();
  const [
    identities,
    sessions,
    clients,
    organizations,
    permissionTuples,
    auditEvents,
    isKratosUp,
    isHydraUp,
    isKetoUp,
    isOathkeeperUp,
  ] = await Promise.all([
    identityAdmin.listIdentities({ pageSize: 500 }).catch(() => []),
    identityAdmin
      .listSessions({ pageSize: 500, active: true })
      .catch(() => []),
    hydraAdmin.listOAuth2Clients({ pageSize: 500 }).catch(() => []),
    listTenants(),
    listRelationTuples(),
    listAuditEvents({}),
    serviceStatus(env.kratosPublicUrl),
    serviceStatus(env.hydraAdminUrl.replace(":4445", ":4444")),
    serviceStatus(env.ketoReadUrl),
    serviceStatus(env.oathkeeperAdminUrl),
  ]);

  const groupIds = new Set(
    (await listRelationTuples("Team")).map((tuple) => tuple.object),
  );
  const pendingAdminRequests = permissionTuples.filter(
    (t) =>
      t.namespace === "Organization" &&
      t.object === "platform" &&
      t.relation === "admin_requested",
  ).length;

  const recent = [...identities]
    .sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0))
    .slice(0, 5);

  const recentOrganizations = [...organizations]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentClients = [...clients]
    .sort((a, b) => (new Date(b.created_at ?? 0).getTime()) - (new Date(a.created_at ?? 0).getTime()))
    .slice(0, 5);

  // No aggregate "all invitations" endpoint exists (tenant-service only
  // lists per-tenant) — fan out across every real tenant rather than
  // fabricating a count. Fine at this scale; would need a real aggregate
  // endpoint if the platform ever has hundreds of organizations.
  const invitationLists = await Promise.all(
    organizations.map((org) => listInvitations(org.id).catch(() => [])),
  );
  const pendingInvitations = invitationLists.flat().filter((inv) => inv.status === "pending");

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="This platform's identity engine, at a glance."
        title="Overview"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Identities" value={identities.length} />
        <Kpi label="Active sessions" value={sessions.length} />
        <Kpi label="OAuth2 clients" value={clients.length} />
        <Kpi label="Organizations" value={organizations.length} />
        <Kpi label="Groups" value={groupIds.size} />
        <Kpi label="Permission tuples" value={permissionTuples.length} />
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Link href={action.href} key={action.href}>
              <Button size="sm" variant="outline">
                {action.label}
              </Button>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_max-content] items-center gap-y-3 text-sm">
              <dt>
                Kratos
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  :4433 / :4434
                </span>
              </dt>
              <dd>
                <StatusBadge isUp={isKratosUp} />
              </dd>
              <dt>
                Hydra
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  :4444 / :4445
                </span>
              </dt>
              <dd>
                <StatusBadge isUp={isHydraUp} />
              </dd>
              <dt>
                Keto
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  :4466 / :4467
                </span>
              </dt>
              <dd>
                <StatusBadge isUp={isKetoUp} />
              </dd>
              <dt>
                Oathkeeper
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  :4455 / :4456
                </span>
              </dt>
              <dd>
                <StatusBadge isUp={isOathkeeperUp} />
              </dd>
            </dl>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Pending admin requests</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingAdminRequests === 0 ? (
              <p className="text-muted-foreground text-sm">No pending requests.</p>
            ) : (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {pendingAdminRequests} user{pendingAdminRequests === 1 ? "" : "s"} requested administrator access.
                </span>
                <Link className="shrink-0 underline" href="/console/settings/administrators">
                  Review
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingInvitations.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending invitations.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {pendingInvitations.slice(0, 5).map((inv) => (
                  <li className="flex items-baseline justify-between gap-4" key={inv.id}>
                    <span className="truncate">{inv.email}</span>
                    <span className="shrink-0 text-muted-foreground text-xs">{inv.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Recent organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrganizations.length === 0 ? (
              <p className="text-muted-foreground text-sm">No organizations yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {recentOrganizations.map((org) => (
                  <li className="flex items-baseline justify-between gap-4" key={org.id}>
                    <Link className="truncate hover:underline" href={`/console/organizations/${org.id}`}>
                      {org.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {org.created_at.replace("T", " ").slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Recent applications</CardTitle>
          </CardHeader>
          <CardContent>
            {recentClients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No OAuth2 clients yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {recentClients.map((client) => (
                  <li className="flex items-baseline justify-between gap-4" key={client.client_id}>
                    <Link
                      className="truncate hover:underline"
                      href={`/console/applications/${encodeURIComponent(client.client_id ?? "")}`}
                    >
                      {client.client_name || client.client_id}
                    </Link>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {client.created_at ? formatDate(client.created_at) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Recent identities</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No identities yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {recent.map((identity) => (
                  <li
                    className="flex items-baseline justify-between gap-4"
                    key={identity.id}
                  >
                    <Link
                      className="truncate hover:underline"
                      href={`/console/identities/${identity.id}`}
                    >
                      {identityTraits(identity).email ?? displayName(identity)}
                    </Link>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {formatDate(identity.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <p className="text-muted-foreground text-sm">
            From platform/audit-service — see <a className="underline" href="/auth/console/audit">Audit Logs</a> for the full, filterable history.
            Not shown here: failed login attempts or registrations-today counts — Kratos's login
            webhook in this platform only fires on a <em>successful</em> authentication (see
            <code> platform/hooks</code>), so failure events are genuinely not captured anywhere,
            not omitted from the UI.
          </p>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit events yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {auditEvents.slice(0, 8).map((event) => (
                <li className="flex items-baseline justify-between gap-4" key={event.id}>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{event.action}</Badge>
                    <span className="font-mono text-muted-foreground text-xs">
                      {event.resource_id ?? ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {event.created_at.replace("T", " ").slice(0, 19)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
