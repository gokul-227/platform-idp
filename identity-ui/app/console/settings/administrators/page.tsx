import type { ReactNode } from "react";

import { identityAdmin, listRelationTuples } from "@/adapters/admin";
import { getSession } from "@/adapters/kratos-flow";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { PageHeader } from "../../page.header";
import {
  approveAdminRequestAction,
  denyAdminRequestAction,
  promoteAdminAction,
  revokeAdminAction,
} from "./actions";

const PLATFORM_ORGANIZATION_ID = "platform";

/**
 * The browser-only way to promote or revoke administrators after the
 * initial /auth/setup bootstrap has already been used once — that page
 * intentionally only ever works while zero admins exist (see
 * platform/hooks's /admin/bootstrap). Every admin after the first is
 * granted from here, by an existing admin, with no curl/Postman/manual
 * Keto tuples required.
 */
export default async function AdministratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; promoted?: string; revoked?: string; denied?: string }>;
}): Promise<ReactNode> {
  const [{ error, promoted, revoked, denied }, tuples, session] = await Promise.all([
    searchParams,
    listRelationTuples("Organization", PLATFORM_ORGANIZATION_ID),
    getSession(),
  ]);

  const adminSubjectIds = tuples.filter((t) => t.relation === "admin" && t.subject_id).map((t) => t.subject_id as string);
  const requestedSubjectIds = tuples
    .filter((t) => t.relation === "admin_requested" && t.subject_id)
    .map((t) => t.subject_id as string);

  const [admins, requests] = await Promise.all([
    Promise.all(
      adminSubjectIds.map(async (id) => {
        try {
          const identity = await identityAdmin.getIdentity({ id });
          return { email: (identity.traits as { email?: string })?.email ?? "(unknown)", id };
        } catch {
          return { email: "(identity not found)", id };
        }
      }),
    ),
    Promise.all(
      requestedSubjectIds.map(async (id) => {
        try {
          const identity = await identityAdmin.getIdentity({ id });
          return { email: (identity.traits as { email?: string })?.email ?? "(unknown)", id };
        } catch {
          return { email: "(identity not found)", id };
        }
      }),
    ),
  ]);

  const currentIdentityId = session?.identity?.id;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Grant or revoke platform-administrator access. This is the only browser path to add a second administrator — /auth/setup only ever works once, while zero admins exist. A user can also request access from their own Account settings page; approve or deny that request below."
        title="Administrators"
      />

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {promoted ? (
        <p className="text-sm text-emerald-600">{promoted} is now a platform administrator.</p>
      ) : null}
      {revoked ? <p className="text-sm text-emerald-600">Administrator access revoked.</p> : null}
      {denied ? <p className="text-sm text-emerald-600">Request denied.</p> : null}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Pending requests</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real, pending <code>Organization:platform#admin_requested</code> Keto tuples — a user
            submitted these from their own Account settings page. Approving grants the same real
            admin tuple as Promote below; denying just clears the request.
          </p>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending requests.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {requests.map((request) => (
                <li className="flex items-center justify-between gap-2" key={request.id}>
                  <span>{request.email}</span>
                  <div className="flex gap-2">
                    <form action={approveAdminRequestAction}>
                      <ConfirmSubmitButton
                        description={`This grants ${request.email} full platform-administrator access — the same as Promote below.`}
                        name="identity_id"
                        title="Approve this request?"
                        value={request.id}
                        variant="default"
                      >
                        Approve
                      </ConfirmSubmitButton>
                    </form>
                    <form action={denyAdminRequestAction}>
                      <ConfirmSubmitButton
                        description={`This clears ${request.email}'s pending request without granting access. They can request again later.`}
                        name="identity_id"
                        title="Deny this request?"
                        value={request.id}
                        variant="outline"
                      >
                        Deny
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Current administrators</CardTitle>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-muted-foreground text-sm">No administrators found.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {admins.map((admin) => (
                <li className="flex items-center justify-between gap-2" key={admin.id}>
                  <span className="flex items-center gap-2">
                    {admin.email}
                    {admin.id === currentIdentityId ? <Badge variant="outline">you</Badge> : null}
                  </span>
                  <form action={revokeAdminAction}>
                    <ConfirmSubmitButton
                      description={`This immediately revokes ${admin.email}'s platform-administrator access.`}
                      disabled={admins.length <= 1}
                      name="identity_id"
                      title="Revoke administrator access?"
                      value={admin.id}
                    >
                      Revoke
                    </ConfirmSubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Promote a user to administrator</CardTitle>
          <p className="text-muted-foreground text-sm">
            The person must have already registered their own account — enter the email address
            they signed up with.
          </p>
        </CardHeader>
        <CardContent>
          <form action={promoteAdminAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input id="email" name="email" required type="email" />
            </Field>
            <Button type="submit">Promote</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
