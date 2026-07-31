import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { formatSubject, listRelationTuples, type RelationTuple } from "@/adapters/admin";
import { listRegistryApps } from "@/adapters/app-registry";
import { listAuditEvents } from "@/adapters/audit-service";
import { listPolicies, listRoles } from "@/adapters/authorization-service";
import { getTenant, listInvitations } from "@/adapters/tenant-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import { PageHeader } from "../../page.header";
import {
  addMemberDetailAction,
  createInvitationDetailAction,
  deleteOrganizationDetailAction,
  grantOrganizationPermissionAction,
  removeMemberDetailAction,
  renameOrganizationDetailAction,
  resendInvitationDetailAction,
  revokeInvitationDetailAction,
  revokeOrganizationPermissionAction,
} from "./actions";

const ORGANIZATION_ROLES = ["member", "admin", "billing_admin"] as const;

function tupleRow(
  organizationId: string,
  tuple: RelationTuple,
  removeAction: (formData: FormData) => Promise<void>,
): ReactNode {
  const subject = formatSubject(tuple);
  return (
    <div className="flex items-center justify-between gap-2 text-sm" key={`${tuple.relation}-${subject}`}>
      <span className="flex items-center gap-2">
        <Badge variant="outline">{tuple.relation}</Badge>
        <span className="font-mono text-xs">{subject}</span>
      </span>
      <form action={removeAction}>
        <input name="organization_id" type="hidden" value={organizationId} />
        <input name="subject_id" type="hidden" value={subject} />
        <input name="role" type="hidden" value={tuple.relation} />
        <input name="relation" type="hidden" value={tuple.relation} />
        <ConfirmSubmitButton
          description={`This removes the ${tuple.relation} relation for ${subject} on this organization. They lose whatever access that relation granted.`}
          name="identity_id"
          title="Remove this relation?"
          value={subject}
        >
          Remove
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

// Organization detail: Members/Groups/Roles/Permissions/Audit/Settings.
// Members is the friendly org-role view (admin/member/billing_admin, the
// same three relations platform/hooks writes on registration). Permissions
// is the raw Keto relation-tuple escape hatch — any relation, not just
// those three (mirrors the Application detail page's Permissions tab).
// Groups lists real Teams whose parent subject_set references this
// organization (Team.parent, wired on /console/groups). Roles shows the
// authorization-service catalog entries scoped to the Organization
// namespace, for context on what a "role" here actually maps to in Keto.
export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;

  const tenant = await getTenant(id);
  if (!tenant) {
    notFound();
  }

  const [orgTuples, teamTuples, roles, policies, auditEvents, invitations, apps] = await Promise.all([
    listRelationTuples("Organization", id),
    listRelationTuples("Team"),
    listRoles(),
    listPolicies(),
    listAuditEvents({ resourceId: id }),
    listInvitations(id),
    listRegistryApps(),
  ]);
  const orgApplications = apps.filter((a) => a.tenant_id === id);
  const orgPolicies = policies.filter((p) => p.object === id);
  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const resolvedInvitations = invitations.filter((i) => i.status !== "pending");

  const memberTuples = orgTuples.filter((t) => ORGANIZATION_ROLES.includes(t.relation as never));
  const otherTuples = orgTuples.filter((t) => !ORGANIZATION_ROLES.includes(t.relation as never));
  const childGroups = Array.from(
    new Set(
      teamTuples
        .filter((t) => t.relation === "parent" && t.subject_set?.object === id)
        .map((t) => t.object),
    ),
  );
  const organizationRoles = roles.filter((r) => r.namespace === "Organization");

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader description={`Organization id: ${id}`} title={tenant.name} />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{tenant.domain ?? "no domain"}</span>
            <Badge variant="outline">{tenant.status}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            platform/tenant-service tracks name, domain, and status for a tenant — there is no
            logo, description, website, support/billing email, timezone, or owner field in its
            real schema yet, so this console doesn&apos;t show inputs for them.
          </p>
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real Keto <code>Organization:{id}</code> tuples for the admin/member/billing_admin
            relations platform/hooks also writes on registration.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={addMemberDetailAction} className="flex flex-wrap items-end gap-4">
            <input name="organization_id" type="hidden" value={id} />
            <Field>
              <FieldLabel htmlFor="identity_id">Identity ID</FieldLabel>
              <Input id="identity_id" name="identity_id" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="role">Role</FieldLabel>
              <Select className="w-auto" defaultValue="member" id="role" name="role">
                {ORGANIZATION_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </Select>
            </Field>
            <Button size="sm" type="submit">Add member</Button>
          </form>
          {memberTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">No members yet.</p>
          ) : (
            memberTuples.map((t) => tupleRow(id, t, removeMemberDetailAction))
          )}
        </CardContent>
      </Card>

      {/* Invitations */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Invitations</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real invitation records (platform/tenant-service), emailed via
            platform/notification-service. Accepting one (at the link in that email) creates the
            actual Organization membership tuple above — an invitation is not itself a Keto
            tuple, since the invited email may not be a registered identity yet.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={createInvitationDetailAction} className="flex flex-wrap items-end gap-4">
            <input name="organization_id" type="hidden" value={id} />
            <Field>
              <FieldLabel htmlFor="invite_email">Email</FieldLabel>
              <Input id="invite_email" name="email" required type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite_role">Role</FieldLabel>
              <Select className="w-auto" defaultValue="member" id="invite_role" name="role">
                {ORGANIZATION_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </Select>
            </Field>
            <Button size="sm" type="submit">Send invitation</Button>
          </form>

          {pendingInvitations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending invitations.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingInvitations.map((invitation) => (
                <div className="flex items-center justify-between gap-2 text-sm" key={invitation.id}>
                  <span className="flex items-center gap-2">
                    <span>{invitation.email}</span>
                    <Badge variant="outline">{invitation.role}</Badge>
                    <span className="text-muted-foreground text-xs">
                      expires {invitation.expires_at}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <form action={resendInvitationDetailAction}>
                      <input name="organization_id" type="hidden" value={id} />
                      <input name="invitation_id" type="hidden" value={invitation.id} />
                      <input name="email" type="hidden" value={invitation.email} />
                      <input name="role" type="hidden" value={invitation.role} />
                      <Button size="sm" type="submit" variant="outline">Resend</Button>
                    </form>
                    <form action={revokeInvitationDetailAction}>
                      <input name="organization_id" type="hidden" value={id} />
                      <ConfirmSubmitButton
                        description={`This invalidates the invitation link sent to ${invitation.email} — clicking it after revocation will fail.`}
                        name="invitation_id"
                        title="Revoke this invitation?"
                        value={invitation.id}
                      >
                        Revoke
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resolvedInvitations.length > 0 ? (
            <div className="flex flex-col gap-1 border-t pt-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">History</p>
              {resolvedInvitations.map((invitation) => (
                <div className="flex items-center justify-between text-sm" key={invitation.id}>
                  <span>{invitation.email}</span>
                  <Badge variant={invitation.status === "accepted" ? "outline" : "secondary"}>
                    {invitation.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Groups */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Groups</CardTitle>
          <p className="text-muted-foreground text-sm">
            Teams linked to this organization via a real Team.parent subject_set tuple — link or
            unlink a team from <a className="underline" href="/auth/console/groups">/console/groups</a>.
          </p>
        </CardHeader>
        <CardContent>
          {childGroups.length === 0 ? (
            <p className="text-muted-foreground text-sm">No groups linked to this organization.</p>
          ) : (
            <ul className="flex flex-col gap-1 font-mono text-sm">
              {childGroups.map((teamId) => (
                <li key={teamId}>{teamId}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Applications */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Applications</CardTitle>
          <p className="text-muted-foreground text-sm">
            registry/apps/*.yaml entries with <code>tenant_id</code> set to this organization —
            see <a className="underline" href="/auth/console/applications">/console/applications</a> to
            manage the registry.
          </p>
        </CardHeader>
        <CardContent>
          {orgApplications.length === 0 ? (
            <p className="text-muted-foreground text-sm">No applications scoped to this organization.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {orgApplications.map((a) => (
                <li key={a.client_id}>
                  <Link className="hover:underline" href={`/console/applications/${encodeURIComponent(a.client_id)}`}>
                    {a.client_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Roles */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
          <p className="text-muted-foreground text-sm">
            authorization-service catalog entries scoped to the Organization namespace — see{" "}
            <a className="underline" href="/auth/console/roles">/console/roles</a> to manage the catalog.
            Assignments actually naming a Keto tuple on this specific organization are listed below.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {organizationRoles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No Organization-scoped roles defined.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {organizationRoles.map((r) => (
                <li key={r.id}>
                  {r.name} <Badge variant="outline">{r.relation}</Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-3">
            <p className="mb-1 font-medium text-xs uppercase tracking-wide">
              Assignments on this organization
            </p>
            {orgPolicies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No role assigned via a tuple on this organization.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {orgPolicies.map((p) => (
                  <li key={p.id}>
                    {p.role_name} <span className="font-mono text-xs">→ {p.subject_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Permissions</CardTitle>
          <p className="text-muted-foreground text-sm">
            Any other real Keto relation tuples on <code>Organization:{id}</code> beyond the
            three member roles above.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={grantOrganizationPermissionAction} className="flex flex-wrap items-end gap-4">
            <input name="organization_id" type="hidden" value={id} />
            <Field>
              <FieldLabel htmlFor="relation">Relation</FieldLabel>
              <Input id="relation" name="relation" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="subject_id">Subject ID</FieldLabel>
              <Input id="subject_id" name="subject_id" required />
            </Field>
            <Button size="sm" type="submit">Grant</Button>
          </form>
          {otherTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">No other tuples.</p>
          ) : (
            otherTuples.map((t) => tupleRow(id, t, revokeOrganizationPermissionAction))
          )}
        </CardContent>
      </Card>

      {/* Audit */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Audit</CardTitle>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit events for this organization yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {auditEvents.map((event) => (
                <li className="flex items-center justify-between" key={event.id}>
                  <span>{event.action}</span>
                  <span className="text-muted-foreground text-xs">{event.created_at}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <form action={renameOrganizationDetailAction} className="flex items-end gap-2">
            <input name="organization_id" type="hidden" value={id} />
            <Field>
              <FieldLabel htmlFor="name">Rename</FieldLabel>
              <Input defaultValue={tenant.name} id="name" name="name" required />
            </Field>
            <Button size="sm" type="submit" variant="outline">Save</Button>
          </form>
          <form action={deleteOrganizationDetailAction}>
            <ConfirmSubmitButton
              description="This permanently deletes the organization (platform/tenant-service record) and every membership relation on it. This cannot be undone."
              name="organization_id"
              title="Delete this organization?"
              value={id}
            >
              Delete organization
            </ConfirmSubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
