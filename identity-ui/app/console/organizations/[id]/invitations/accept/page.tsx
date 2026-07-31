import Link from "next/link";
import type { ReactNode } from "react";

import { getSession } from "@/adapters/kratos-flow";
import { createRelationTuple } from "@/adapters/console-api";
import { acceptInvitation } from "@/adapters/tenant-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { PageHeader } from "../../../../page.header";

// The real invitation-link landing page: the identity clicking the link
// from their real invitation email must be signed in first (Kratos
// session, checked live via getSession()), then this calls
// tenant-service's real /invitations/{token}/accept (validates
// expiry/status server-side) and, only on success, grants the real Keto
// Organization tuple for that identity — the same createRelationTuple this
// console's Permissions/Members pages already use, not a new write path.
export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { id } = await params;
  const query = await searchParams;
  const token = query.token;
  // Must include the /auth basePath explicitly: this is handed to Kratos's
  // login flow as a literal browser-facing return_to, not resolved through
  // Next's own router (which would add basePath automatically for a Link).
  const returnTo = `/auth/console/organizations/${id}/invitations/accept?token=${token ?? ""}`;

  if (!token) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Organization invitation" title="Accept invitation" />
        <Card className="gap-4">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">Missing invitation token.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const session = await getSession();
  if (!session?.identity) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Organization invitation" title="Accept invitation" />
        <Card className="gap-4">
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm">Sign in to accept this invitation.</p>
            <a
              className="inline-flex h-9 w-fit items-center justify-center rounded-3xl bg-primary px-4 text-primary-foreground text-sm hover:bg-primary/90"
              href={`/auth/login?return_to=${encodeURIComponent(returnTo)}`}
            >
              Sign in
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const accepted = await acceptInvitation(token);
  if (!accepted.ok || !accepted.tenantId || !accepted.role) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Organization invitation" title="Accept invitation" />
        <Card className="gap-4">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{accepted.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const granted = await createRelationTuple({
    namespace: "Organization",
    object: accepted.tenantId,
    relation: accepted.role,
    subjectId: session.identity.id,
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader description="Organization invitation" title="Accept invitation" />
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">
            {granted.ok ? "Invitation accepted" : "Accepted, but membership grant failed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            You are now a <strong>{accepted.role}</strong> of this organization.
          </p>
          {!granted.ok ? (
            <p className="text-destructive">
              {granted.error} — contact an administrator to grant membership manually.
            </p>
          ) : null}
          <Link
            className="underline"
            href={`/console/organizations/${accepted.tenantId}`}
          >
            View organization
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
