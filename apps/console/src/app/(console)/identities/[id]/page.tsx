import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { authorityOf, traitsOf } from "@aec-craft/platform-id-sdk/identity";
import { DataTable } from "@aec-craft/ui/components/blocks/data-table";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import type { Identity } from "@ory/client-fetch";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuditHistory } from "@/components/audit.history";
import { ConfirmButton } from "@/components/confirm.button";
import { CopyButton } from "@/components/copy.button";
import {
  DetailCard,
  DetailJson,
  DetailList,
  DetailRow,
  hasEntries,
} from "@/components/detail.list";
import { PageHeader } from "@/components/page.header";
import { listEventsForIdentity } from "@/lib/audit.feed";
import { identityAdmin } from "@/lib/kratos.admin";
import { configuredRoots } from "@/lib/roots";
import { getActor } from "@/lib/staff";
import { revokeIdentitySessions, revokeSession } from "../actions";
import { IdentityMenu } from "../identity.menu";
import {
  addressStatus,
  CredentialRow,
  IdentityBadges,
  SESSION_COLUMNS,
  SecondFactorNote,
  SessionDeviceCell,
  sessionMethods,
} from "./identity.detail.sections";
import { RecoveryForm } from "./recovery.form";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  let identity: Identity | null = null;
  try {
    identity = await identityAdmin.getIdentity({
      id,
      includeCredential: ["code", "totp", "lookup_secret", "webauthn", "oidc"],
    });
  } catch {
    identity = null;
  }
  if (!identity) {
    notFound();
  }

  const traits = traitsOf(identity);
  const [sessions, history] = await Promise.all([
    identityAdmin.listIdentitySessions({ id }).catch(() => []),
    listEventsForIdentity(id).catch(() => ({ events: [], total: 0 })),
  ]);
  const credentials = Object.entries(identity.credentials ?? {});
  const isActive = identity.state === "active";
  const actor = await getActor();
  const authority = authorityOf(identity, configuredRoots());
  // Kratos returns every session it has ever issued and offers no paging here,
  // so an old account arrives with dozens of expired rows that carry no action
  // and answer nothing. The live ones are the state; the rest is history.
  const activeSessions = sessions.filter((session) => session.active);
  const expiredCount = sessions.length - activeSessions.length;
  const fullName = [traits.name?.first, traits.name?.last]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        actions={
          actor ? (
            <IdentityMenu
              actorAuthority={actor.authority}
              authority={authority}
              email={traits.email}
              id={identity.id}
              isActive={isActive}
            />
          ) : undefined
        }
        back={{ href: "/identities", label: "Identities" }}
        badges={<IdentityBadges authority={authority} isActive={isActive} />}
        description={[fullName ? traits.email : null, identity.id]
          .filter(Boolean)
          .join(" · ")}
        title={fullName || (traits.email ?? identity.id)}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title="Account">
          <DetailList>
            <DetailRow
              label="ID"
              mono
              value={
                <span className="inline-flex items-center gap-1">
                  {identity.id}
                  <CopyButton value={identity.id} />
                </span>
              }
            />
            <DetailRow label="Schema" mono value={identity.schema_id} />
            <DetailRow
              label="State since"
              value={formatDate(identity.state_changed_at)}
            />
            <DetailRow
              label="Created"
              value={formatDate(identity.created_at)}
            />
            <DetailRow
              label="Updated"
              value={formatDate(identity.updated_at)}
            />
            <DetailRow
              label="Organization"
              mono
              value={identity.organization_id}
            />
            <DetailRow label="External ID" mono value={identity.external_id} />
          </DetailList>
        </DetailCard>

        <DetailCard title="Addresses">
          <div className="flex flex-col gap-4">
            <DetailList>
              {(identity.verifiable_addresses ?? []).map((address) => (
                <DetailRow
                  key={address.id}
                  label={address.via ?? "email"}
                  value={
                    <span className="flex flex-wrap items-baseline gap-2">
                      {address.value}
                      <Badge
                        variant={address.verified ? "outline" : "secondary"}
                      >
                        {addressStatus(address.verified, address.status)}
                      </Badge>
                      {address.verified_at ? (
                        <span className="text-muted-foreground text-xs">
                          {formatDate(address.verified_at)}
                        </span>
                      ) : null}
                    </span>
                  }
                />
              ))}
            </DetailList>
            {(identity.recovery_addresses ?? []).length > 0 ? (
              <div className="flex flex-col gap-1 border-rule border-t pt-4">
                <p className="text-muted-foreground text-sm">
                  Recovery addresses
                </p>
                <DetailList>
                  {(identity.recovery_addresses ?? []).map((address) => (
                    <DetailRow
                      key={address.id}
                      label={address.via ?? "email"}
                      value={address.value}
                    />
                  ))}
                </DetailList>
              </div>
            ) : null}
          </div>
        </DetailCard>

        <DetailCard title="Credentials">
          <div className="flex flex-col gap-4">
            <SecondFactorNote identity={identity} />
            <ul className="flex flex-col gap-3">
              {credentials.map(([method, credential]) => (
                <CredentialRow
                  credential={credential}
                  identityId={identity.id}
                  key={method}
                  method={method}
                />
              ))}
            </ul>
            <div className="flex flex-col gap-2 border-rule border-t pt-4">
              <p className="text-muted-foreground text-sm">Recovery hand-off</p>
              <RecoveryForm identityId={identity.id} />
            </div>
          </div>
        </DetailCard>

        <DetailCard title="Traits">
          <DetailJson value={identity.traits} />
        </DetailCard>

        {hasEntries(identity.metadata_public) ? (
          <DetailCard title="Public metadata">
            <DetailJson value={identity.metadata_public} />
          </DetailCard>
        ) : null}

        {hasEntries(identity.metadata_admin) ? (
          <DetailCard title="Admin metadata">
            <DetailJson value={identity.metadata_admin} />
          </DetailCard>
        ) : null}
      </div>

      <DataTable
        columns={SESSION_COLUMNS}
        empty="No active sessions."
        title={
          expiredCount > 0
            ? `Active sessions (${expiredCount} expired)`
            : "Active sessions"
        }
        toolbar={
          activeSessions.length > 0 ? (
            <ConfirmButton
              action={revokeIdentitySessions.bind(null, identity.id)}
              confirmLabel="Revoke all sessions"
              description="Signs this identity out everywhere."
              size="sm"
              title="Revoke all sessions?"
              variant="outline"
            >
              Revoke all
            </ConfirmButton>
          ) : undefined
        }
      >
        {activeSessions.map((session) => (
          <TableRow key={session.id}>
            <TableCell>
              <SessionDeviceCell session={session} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {sessionMethods(session)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {session.authenticator_assurance_level}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(session.authenticated_at)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(session.expires_at)}
            </TableCell>
            <TableCell>
              {session.active ? (
                <ConfirmButton
                  action={revokeSession.bind(null, identity.id, session.id)}
                  confirmLabel="Revoke session"
                  description="Signs out this session only."
                  size="sm"
                  title="Revoke this session?"
                  variant="ghost"
                >
                  Revoke
                </ConfirmButton>
              ) : (
                <span className="text-muted-foreground text-xs">inactive</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <AuditHistory
        events={history.events}
        total={history.total}
        viewAllHref={`/audit?resource=identity&resourceId=${encodeURIComponent(identity.id)}`}
      />
    </div>
  );
}
