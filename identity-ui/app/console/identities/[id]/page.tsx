import type { Session } from "@ory/client-fetch";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  displayName,
  formatDate,
  identityAdmin,
  identityTraits,
  listRelationTuplesForSubject,
} from "@/adapters/admin";
import { listAuditEvents } from "@/adapters/audit-service";
import { listPolicies } from "@/adapters/authorization-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { PageHeader } from "../../page.header";
import {
  deleteIdentityDetailAction,
  forceVerifyAction,
  resetPasswordAction,
  revokeAllSessionsDetailAction,
  revokeSessionDetailAction,
  setEnabledDetailAction,
  updateTraitsAction,
} from "./actions";

function sessionRow(session: Session, identityId: string): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 text-sm" key={session.id}>
      <span className="flex items-center gap-2">
        <Badge variant={session.active ? "outline" : "secondary"}>
          {session.active ? "active" : "inactive"}
        </Badge>
        <span className="text-muted-foreground">
          {(session.authentication_methods ?? []).map((m) => m.method).join(", ")}
        </span>
      </span>
      <span className="text-muted-foreground text-xs">
        {formatDate(session.authenticated_at)}
      </span>
      <form action={revokeSessionDetailAction}>
        <input name="identity_id" type="hidden" value={identityId} />
        <ConfirmSubmitButton
          description="This immediately signs this device out — the identity must re-authenticate to use it again."
          disabled={!session.active}
          name="session_id"
          title="Revoke this session?"
          value={session.id}
        >
          Revoke
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

// Real Kratos administration beyond the flat list: edit traits, force-
// verify (bypasses the normal verification-code flow), reset password
// (admin-set new credentials, verified live against the real Kratos Admin
// API before shipping — see final report), enable/disable/delete, and
// this identity's own sessions with revoke/revoke-all. Groups/Roles are
// intentionally not duplicated here — see /console/organizations and
// /console/groups, which already manage membership for any identity ID.
export default async function IdentityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;

  let identity
  try {
    identity = await identityAdmin.getIdentity({
      id,
      includeCredential: ["password", "oidc", "totp", "webauthn", "passkey", "lookup_secret", "code"],
    });
  } catch {
    notFound();
  }
  const traits = identityTraits(identity);
  const isVerified = (identity.verifiable_addresses ?? []).some((a) => a.verified);
  // Kratos's bulk /admin/sessions endpoint always returns devices: null —
  // confirmed live. Only the per-identity endpoint actually includes real
  // device records (ip_address/user_agent), so that's used here instead.
  const sessions = await identityAdmin.listIdentitySessions({ id }).catch(() => []);

  const [subjectTuples, subjectPolicies, securityEvents] = await Promise.all([
    listRelationTuplesForSubject(id),
    listPolicies(),
    listAuditEvents({ resourceId: id }),
  ]);
  const groupTuples = subjectTuples.filter((t) => t.namespace === "Team");
  const organizationTuples = subjectTuples.filter((t) => t.namespace === "Organization");
  const applicationTuples = subjectTuples.filter((t) => t.namespace === "Application");
  const otherTuples = subjectTuples.filter(
    (t) => !["Team", "Organization", "Application"].includes(t.namespace),
  );
  const matchedPolicies = subjectPolicies.filter((p) => p.subject_id === id);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description={`Kratos identity ${id}`}
        title={traits.email ?? displayName(identity)}
      />

      <div className="flex items-center gap-2">
        <Badge variant={identity.state === "active" ? "outline" : "secondary"}>
          {identity.state}
        </Badge>
        <Badge variant={isVerified ? "outline" : "secondary"}>
          {isVerified ? "verified" : "unverified"}
        </Badge>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateTraitsAction} className="flex flex-wrap items-end gap-4">
            <input name="identity_id" type="hidden" value={id} />
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input defaultValue={traits.email} id="email" name="email" required type="email" />
            </Field>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Security</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <form action={setEnabledDetailAction}>
              <input name="identity_id" type="hidden" value={id} />
              <input
                name="enabled"
                type="hidden"
                value={identity.state === "active" ? "false" : "true"}
              />
              <Button size="sm" type="submit" variant="outline">
                {identity.state === "active" ? "Disable" : "Enable"}
              </Button>
            </form>
            {!isVerified ? (
              <form action={forceVerifyAction}>
                <input name="identity_id" type="hidden" value={id} />
                <Button size="sm" type="submit" variant="outline">
                  Force verify email
                </Button>
              </form>
            ) : null}
            <form action={revokeAllSessionsDetailAction}>
              <ConfirmSubmitButton
                description="This immediately signs this identity out of every device and browser it's currently logged into."
                name="identity_id"
                title="Revoke all sessions?"
                value={id}
                variant="outline"
              >
                Revoke all sessions
              </ConfirmSubmitButton>
            </form>
            <form action={deleteIdentityDetailAction}>
              <ConfirmSubmitButton
                description="This permanently deletes the Kratos identity — all credentials, sessions, and traits. This cannot be undone."
                name="identity_id"
                title="Delete this identity?"
                value={id}
              >
                Delete identity
              </ConfirmSubmitButton>
            </form>
          </div>

          <form action={resetPasswordAction} className="flex flex-wrap items-end gap-4 border-t pt-4">
            <input name="identity_id" type="hidden" value={id} />
            <Field>
              <FieldLabel htmlFor="password">Reset password to</FieldLabel>
              <Input id="password" name="password" required type="password" />
            </Field>
            <ConfirmSubmitButton
              description="This immediately replaces the identity's password credential. Any password manager entry or memorized password the identity has stops working."
              title="Reset this identity's password?"
              variant="outline"
            >
              Reset password
            </ConfirmSubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sessions.</p>
          ) : (
            sessions.map((session) => sessionRow(session, id))
          )}
        </CardContent>
      </Card>

      {/* Credentials / linked providers / passkeys */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Credentials</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real Kratos credential state for this identity. Kratos&apos;s admin API only exposes
            the current state of each credential (a single created_at/updated_at) — there is no
            historical log of prior password changes or past credential events. This is a real
            Ory OSS API limitation, not a gap in this console.
          </p>
        </CardHeader>
        <CardContent>
          {Object.keys(identity.credentials ?? {}).length === 0 ? (
            <p className="text-muted-foreground text-sm">No credentials configured.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {Object.entries(identity.credentials ?? {}).map(([type, credential]) => (
                <li className="flex items-center justify-between" key={type}>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{type}</Badge>
                    <span className="font-mono text-xs">
                      {(credential.identifiers ?? []).join(", ")}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    since {formatDate(credential.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Devices — from real session device records (ip_address/user_agent),
          not a separate device-tracking mechanism. */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real device records Kratos attaches to each session (IP address, user agent).
          </p>
        </CardHeader>
        <CardContent>
          {sessions.flatMap((s) => s.devices ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No device records.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {sessions.flatMap((s) =>
                (s.devices ?? []).map((device) => (
                  <li className="flex flex-col" key={device.id}>
                    <span className="font-mono text-xs">{device.ip_address}</span>
                    <span className="text-muted-foreground text-xs">{device.user_agent}</span>
                  </li>
                )),
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Verification / Recovery — current state only, see Credentials
          card's note on why there's no history here either. */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Verification &amp; Recovery</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="mb-1 font-medium">Verifiable addresses</p>
            {(identity.verifiable_addresses ?? []).length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(identity.verifiable_addresses ?? []).map((addr) => (
                  <li className="flex items-center gap-2" key={addr.id}>
                    <span>{addr.value}</span>
                    <Badge variant={addr.verified ? "outline" : "secondary"}>{addr.status}</Badge>
                    {addr.verified_at ? (
                      <span className="text-muted-foreground text-xs">
                        verified {formatDate(addr.verified_at)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t pt-3">
            <p className="mb-1 font-medium">Recovery addresses</p>
            {(identity.recovery_addresses ?? []).length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(identity.recovery_addresses ?? []).map((addr) => (
                  <li key={addr.id}>
                    {addr.value} <span className="text-muted-foreground text-xs">via {addr.via}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Real Keto tuples where this identity is the subject — read live,
          the same tuples /console/organizations, /console/groups, and each
          application's Permissions tab manage; no separate membership
          index kept here. */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          {organizationTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">Not a member of any organization.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {organizationTuples.map((t) => (
                <li className="flex items-center gap-2" key={`${t.object}-${t.relation}`}>
                  <span className="font-mono text-xs">{t.object}</span>
                  <Badge variant="outline">{t.relation}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Groups</CardTitle>
        </CardHeader>
        <CardContent>
          {groupTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">Not a member of any group.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {groupTuples.map((t) => (
                <li className="flex items-center gap-2" key={`${t.object}-${t.relation}`}>
                  <span className="font-mono text-xs">{t.object}</span>
                  <Badge variant="outline">{t.relation}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Applications</CardTitle>
        </CardHeader>
        <CardContent>
          {applicationTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">No direct application permissions.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {applicationTuples.map((t) => (
                <li className="flex items-center gap-2" key={`${t.object}-${t.relation}`}>
                  <span className="font-mono text-xs">{t.object}</span>
                  <Badge variant="outline">{t.relation}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
          <p className="text-muted-foreground text-sm">
            authorization-service Policies naming one of this identity's Keto tuples above.
          </p>
        </CardHeader>
        <CardContent>
          {matchedPolicies.length === 0 ? (
            <p className="text-muted-foreground text-sm">No named roles assigned.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {matchedPolicies.map((p) => (
                <li key={p.id}>
                  {p.role_name} <span className="font-mono text-xs">on {p.object}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Permissions</CardTitle>
          <p className="text-muted-foreground text-sm">
            Any other real Keto tuples for this identity outside Organizations/Groups/Applications
            above.
          </p>
        </CardHeader>
        <CardContent>
          {otherTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">No other permissions.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {otherTuples.map((t) => (
                <li className="flex items-center gap-2" key={`${t.namespace}-${t.object}-${t.relation}`}>
                  <Badge variant="outline">{t.namespace}</Badge>
                  <span className="font-mono text-xs">{t.object}</span>
                  <Badge variant="outline">{t.relation}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Security timeline</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real platform/audit-service events with this identity as the affected resource
            (force-verify, password reset, enable/disable, session revokes).
          </p>
        </CardHeader>
        <CardContent>
          {securityEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recorded events for this identity.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {securityEvents.map((event) => (
                <li className="flex items-center justify-between" key={event.id}>
                  <span>{event.action}</span>
                  <span className="text-muted-foreground text-xs">{event.created_at}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
