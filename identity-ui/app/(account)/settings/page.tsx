import type { ReactNode } from "react";

import { listRelationTuplesForSubject } from "@/adapters/admin";
import {
  getBrowserFlow,
  getSession,
  listMyOtherSessions,
} from "@/adapters/kratos-flow";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/vendor/ui/card";
import { ConnectedAccountsSection } from "@/components/connected-accounts-section";
import { FlowForm } from "@/components/flow-form";
import { ProfileSection } from "@/components/profile-section";
import { SessionsSection } from "@/components/sessions-section";
import type { FlowSearchParams } from "@/types/flow";
import { PageHeader } from "@/app/console/page.header";
import { cancelAdminRequestAction, requestAdminAccessAction } from "./actions";

const PLATFORM_ORGANIZATION_ID = "platform";

// Matches .reference/platform-ory-id-spike/apps/id's settings page exactly:
// filter a fixed list of candidate sections down to whichever Kratos node
// groups the flow actually returned. Kratos only emits a "totp"/
// "lookup_secret" group if MFA is actually enrolled and enabled in this
// platform's config — showing the section unconditionally would mean a
// broken, non-functional card for setups that don't have it configured.
// "Profile" is rendered separately below via ProfileSection (grouped
// fieldsets + a disclaimer on the organization/status fields, which are
// real schema fields but purely informational — see that component) —
// not through this generic per-group loop.
const SECTIONS = [
  {
    description:
      "Sign in without a password, using a fingerprint, face, or security key registered to this device.",
    groups: ["passkey"],
    title: "Passkeys",
  },
  {
    description:
      "Security keys or platform authenticators as a second factor (separate from passkeys, which replace the password entirely).",
    groups: ["webauthn"],
    title: "Security keys",
  },
  {
    description:
      "Time-based one-time codes from an authenticator app, as a second factor.",
    groups: ["totp"],
    title: "Authenticator app",
  },
  {
    description:
      "One-time backup codes for when you lose access to your second factor.",
    groups: ["lookup_secret"],
    title: "Recovery codes",
  },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const [flow, otherSessions, session] = await Promise.all([
    getBrowserFlow("settings", params),
    listMyOtherSessions(),
    getSession(),
  ]);
  const sessions = session ? [session, ...otherSessions] : otherSessions;
  const groupsPresent = new Set(flow.ui.nodes.map((node) => node.group));

  const myOrgTuples = session?.identity?.id
    ? await listRelationTuplesForSubject(session.identity.id).then((tuples) =>
        tuples.filter((t) => t.namespace === "Organization" && t.object === PLATFORM_ORGANIZATION_ID),
      )
    : [];
  const isAdmin = myOrgTuples.some((t) => t.relation === "admin");
  const hasPendingRequest = myOrgTuples.some((t) => t.relation === "admin_requested");

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex gap-4 text-muted-foreground text-sm">
            <a className="hover:text-foreground" href="/auth">
              Back
            </a>
            <a className="hover:text-foreground" href="/auth/logout">
              Sign out
            </a>
          </div>
        }
        description="Sign-in and profile settings for this account."
        title="Account settings"
      />

      {groupsPresent.has("profile") ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <p className="text-muted-foreground text-sm">
              Your identity details, grouped by what they&apos;re actually for.
            </p>
          </CardHeader>
          <CardContent>
            <ProfileSection flow={flow} />
          </CardContent>
        </Card>
      ) : null}

      {SECTIONS.filter((section) =>
        section.groups.some((group) => groupsPresent.has(group)),
      ).map((section) => (
        <Card className="gap-4" key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {section.description}
            </p>
          </CardHeader>
          <CardContent>
            <FlowForm flow={flow} groups={[...section.groups]} />
          </CardContent>
        </Card>
      ))}

      {groupsPresent.has("oidc") ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Connected accounts</CardTitle>
            <p className="text-muted-foreground text-sm">
              Sign-in providers linked to this account.
            </p>
          </CardHeader>
          <CardContent>
            <ConnectedAccountsSection flow={flow} />
          </CardContent>
        </Card>
      ) : null}

      {/* Reserved location only — Phase 9 asked to reserve this spot on the
          page, not implement it. No form fields/buttons/backend calls here
          on purpose: an organization-level SSO provider (e.g. a SAML/OIDC
          connection an org admin configures once for all members) is a
          real future feature, but there is no backend for it yet anywhere
          in this platform. A disabled-looking "Save" button or fake inputs
          here would be exactly the "placeholder that looks real"
          anti-pattern this repo's CLAUDE.md calls out — so this card is
          deliberately inert: heading, explanation, "Coming soon" badge,
          nothing to click. */}
      <Card className="gap-4 opacity-75">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Organization SSO</CardTitle>
            <Badge variant="secondary">Coming soon</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Configure your organization&apos;s SSO provider so members can sign in without a
            separate password. Not yet available — reserved for a future release.
          </p>
        </CardHeader>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <p className="text-muted-foreground text-sm">
            Where you&apos;re signed in. Revoke a device to end its session.
          </p>
        </CardHeader>
        <CardContent>
          <SessionsSection currentSessionId={session?.id} sessions={sessions} />
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Administrator access</CardTitle>
          <p className="text-muted-foreground text-sm">
            Platform administration is the Admin Console at /console — everything in the Ory
            stack. Requesting access here writes a real, pending Keto tuple; an existing
            administrator must approve it from Settings → Administrators before it takes effect.
          </p>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <Badge variant="outline">You are already a platform administrator.</Badge>
          ) : hasPendingRequest ? (
            <div className="flex items-center gap-3">
              <Badge variant="secondary">Request pending administrator approval</Badge>
              <form action={cancelAdminRequestAction}>
                <Button size="sm" type="submit" variant="outline">
                  Cancel request
                </Button>
              </form>
            </div>
          ) : (
            <form action={requestAdminAccessAction}>
              <Button size="sm" type="submit" variant="outline">
                Request administrator access
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
