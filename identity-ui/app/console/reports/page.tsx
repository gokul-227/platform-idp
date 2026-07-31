import type { ReactNode } from "react";

import { hydraAdmin, identityAdmin } from "@/adapters/admin";
import { listAuditEvents, type AuditEvent } from "@/adapters/audit-service";
import { listRegistryApps } from "@/adapters/app-registry";
import { listFlows } from "@/adapters/flow-service";
import { listIdentityProviders } from "@/adapters/identity-providers";
import { listTenants } from "@/adapters/tenant-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { PageHeader } from "../page.header";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function lastNDayKeys(n: number, now: Date): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * DAY_MS);
    return d.toISOString().slice(0, 10);
  });
}

function BarChart({
  title, description, series,
}: {
  title: string; description: string; series: { day: string; count: number }[];
}): ReactNode {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-1">
          {series.map((s) => (
            <div className="flex flex-1 flex-col items-center gap-1" key={s.day} title={`${s.day}: ${s.count}`}>
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${Math.max(2, (s.count / max) * 100)}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{s.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function bucketByDay(dates: string[], now: Date): { day: string; count: number }[] {
  const keys = lastNDayKeys(WINDOW_DAYS, now);
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const iso of dates) {
    const key = dayKey(iso);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((day) => ({ count: counts.get(day) ?? 0, day }));
}

function actionBreakdown(events: AuditEvent[]): { action: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.action, (counts.get(e.action) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// Every number here is read live from a real backend (audit-service,
// Kratos, Hydra, config/identity-providers.yaml) — there is no synthetic
// or placeholder data. Two metrics the priority list asked for — failed
// login attempts and permission-check history — are NOT rendered: Kratos's
// admin API exposes sessions (successful authentications) but not failed
// attempts, and Keto has no check-history log at all. Faking either would
// violate "no fake data" more than omitting them; see the final report's
// Remaining Limitations section for what real instrumentation this would
// require.
export default async function ReportsPage(): Promise<ReactNode> {
  const now = new Date();
  const [identities, sessions, auditEvents, clients, providers, tenants, apps, flows] =
    await Promise.all([
      identityAdmin.listIdentities({ pageSize: 500 }).catch(() => []),
      // expand: ["identity"] is required — Kratos's bulk /admin/sessions
      // endpoint returns identity: null without it (confirmed live), which
      // would silently zero out DAU/WAU/MAU below.
      identityAdmin.listSessions({ expand: ["identity"], pageSize: 500 }).catch(() => []),
      listAuditEvents({}),
      hydraAdmin.listOAuth2Clients({ pageSize: 500 }).catch(() => []),
      listIdentityProviders(),
      listTenants(),
      listRegistryApps(),
      listFlows(),
    ]);

  const activeSessions = sessions.filter((s) => s.active);
  const loginsByDay = bucketByDay(
    activeSessions
      .map((s) => s.authenticated_at)
      .filter((d): d is Date => Boolean(d))
      .map((d) => d.toISOString()),
    now,
  );
  const auditByDay = bucketByDay(auditEvents.map((e) => e.created_at), now);
  const topActions = actionBreakdown(auditEvents);
  const organizationsByDay = bucketByDay(tenants.map((t) => t.created_at), now);
  const enabledApps = apps.filter((a) => a.enabled).length;
  const flowsByType = new Map<string, { total: number; enabled: number }>();
  for (const flow of flows) {
    const entry = flowsByType.get(flow.type) ?? { enabled: 0, total: 0 };
    entry.total += 1;
    if (flow.enabled) entry.enabled += 1;
    flowsByType.set(flow.type, entry);
  }

  // DAU/WAU/MAU: distinct identities with a real authenticated_at session
  // timestamp within the window — the standard definition, computed from
  // real session data (successful logins only; see the disclosure above
  // on why failed attempts can't be included).
  function distinctIdentitiesSince(days: number): number {
    const cutoff = now.getTime() - days * DAY_MS;
    const ids = new Set(
      sessions
        .filter((s) => s.authenticated_at && s.authenticated_at.getTime() >= cutoff)
        .map((s) => s.identity?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return ids.size;
  }
  const dau = distinctIdentitiesSince(1);
  const wau = distinctIdentitiesSince(7);
  const mau = distinctIdentitiesSince(30);

  // Verification statistics: real per-identity verifiable_addresses state
  // (verified boolean + verified_at) — not audit-service events, since
  // self-service verification completes through Kratos's own courier/flow
  // and never touches console-api or its audit log.
  const verifiedCount = identities.filter((i) =>
    (i.verifiable_addresses ?? []).some((a) => a.verified),
  ).length;
  const verificationsByDay = bucketByDay(
    identities
      .flatMap((i) => i.verifiable_addresses ?? [])
      .map((a) => a.verified_at)
      .filter((d): d is Date => Boolean(d))
      .map((d) => d.toISOString()),
    now,
  );

  // Password reset statistics: only admin-initiated resets are captured
  // (identity.password_reset audit events) — Kratos's own self-service
  // recovery flow completes entirely within Kratos/courier and is never
  // routed through console-api, so it never reaches audit-service. This
  // undercounts real-world self-service resets; disclosed on the card.
  const passwordResetEvents = auditEvents.filter((e) => e.action === "identity.password_reset");

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Real usage and activity metrics, read live from audit-service, Kratos, and Hydra — no synthetic data."
        title="Reports"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Daily active users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{dau}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Weekly active users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{wau}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Monthly active users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{mau}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Identities (verified/total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">
              {verifiedCount}/{identities.length}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Identities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{identities.length}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Active sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{activeSessions.length}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              OAuth2 clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{clients.length}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Organizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{tenants.length}</span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Applications (enabled/total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">
              {enabledApps}/{apps.length}
            </span>
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Audit events (last {auditEvents.length >= 200 ? "200, capped" : auditEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-3xl tabular-nums">{auditEvents.length}</span>
          </CardContent>
        </Card>
      </div>

      <BarChart
        description="Sessions with a real authenticated_at timestamp, by day (Kratos does not expose failed login attempts via its admin API — this reflects successful logins only)."
        series={loginsByDay}
        title="Successful logins"
      />

      <BarChart
        description="platform/audit-service events, by day."
        series={auditByDay}
        title="Audit activity"
      />

      <BarChart
        description="platform/tenant-service organizations, by real created_at day."
        series={organizationsByDay}
        title="Organization growth"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Flow usage</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real enabled/total counts per flow type from platform/flow-service — not request
            volume (Kratos doesn't expose per-flow invocation counts).
          </p>
        </CardHeader>
        <CardContent>
          {flowsByType.size === 0 ? (
            <p className="text-muted-foreground text-sm">No flows configured yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {Array.from(flowsByType.entries()).map(([type, counts]) => (
                <li className="flex items-center justify-between" key={type}>
                  <span>{type}</span>
                  <Badge variant="outline">{counts.enabled}/{counts.total} enabled</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Top audit actions</CardTitle>
        </CardHeader>
        <CardContent>
          {topActions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit events recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {topActions.map((a) => (
                <li className="flex items-center justify-between" key={a.action}>
                  <span className="font-mono text-xs">{a.action}</span>
                  <Badge variant="outline">{a.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BarChart
        description="Real per-address verified_at timestamps across all identities, by day."
        series={verificationsByDay}
        title="Verifications"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Password reset statistics</CardTitle>
          <p className="text-muted-foreground text-sm">
            Only admin-initiated resets are counted ({passwordResetEvents.length} recorded) —
            Kratos&apos;s own self-service recovery flow completes entirely within
            Kratos/courier and never touches console-api or its audit log, so real-world
            self-service resets are undercounted here. This is a genuine gap in what Kratos&apos;s
            admin API exposes, not a bug in this reporting.
          </p>
        </CardHeader>
        <CardContent>
          <span className="font-semibold text-2xl tabular-nums">
            {passwordResetEvents.length}
          </span>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a
            className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
            download="neobim-reports.json"
            href={`data:application/json,${encodeURIComponent(
              JSON.stringify(
                {
                  active_sessions: activeSessions.length,
                  applications: { enabled: enabledApps, total: apps.length },
                  audit_events_total: auditEvents.length,
                  dau, wau, mau,
                  identities_total: identities.length,
                  identities_verified: verifiedCount,
                  organizations_total: tenants.length,
                  password_resets_admin_initiated: passwordResetEvents.length,
                },
                null,
                2,
              ),
            )}`}
          >
            Download JSON
          </a>
          <a
            className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
            download="neobim-reports.csv"
            href={`data:text/csv,${encodeURIComponent(
              [
                "metric,value",
                `dau,${dau}`,
                `wau,${wau}`,
                `mau,${mau}`,
                `identities_total,${identities.length}`,
                `identities_verified,${verifiedCount}`,
                `active_sessions,${activeSessions.length}`,
                `organizations_total,${tenants.length}`,
                `applications_enabled,${enabledApps}`,
                `applications_total,${apps.length}`,
                `audit_events_total,${auditEvents.length}`,
                `password_resets_admin_initiated,${passwordResetEvents.length}`,
              ].join("\n"),
            )}`}
          >
            Download CSV
          </a>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Identity providers configured</CardTitle>
          <p className="text-muted-foreground text-sm">
            Kratos does not track per-provider login counts — this shows real configuration
            state only, not usage volume.
          </p>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No identity providers configured.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {providers.map((p) => (
                <li className="flex items-center justify-between" key={p.id}>
                  <span>{p.id}</span>
                  <Badge variant={p.enabled ? "outline" : "secondary"}>
                    {p.enabled ? "enabled" : "disabled"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
