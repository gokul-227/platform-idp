import { DangerZone } from "@aec-craft/ui/components/blocks/danger-zone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { CaretLeftIcon } from "@aec-craft/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { FlowForm, FlowMessages } from "@/components/flow.form";
import { hydraAdmin } from "@/lib/hydra";
import {
  type FlowSearchParams,
  getBrowserFlow,
  getSession,
  listMyOtherSessions,
} from "@/lib/kratos";
import { safeReturnTo } from "@/lib/safe-return-to";
import { ENTERPRISE_PROVIDER_IDS } from "@/lib/sso";
import { ApplicationsSection } from "./applications.section";
import { ConnectionsSection } from "./connections.section";
import { DangerSection } from "./danger.section";
import { SessionsSection } from "./sessions.section";
import { TenancySection } from "./tenancy.section";

const SECTIONS = [
  {
    description: "Your name and email address.",
    groups: ["profile"],
    title: "Profile",
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to);
  const [flow, otherSessions, session] = await Promise.all([
    getBrowserFlow("settings", params),
    listMyOtherSessions(),
    getSession(),
  ]);
  // whoami excludes itself from listMySessions; put the current device first.
  const sessions = session ? [session, ...otherSessions] : otherSessions;
  const identity = session?.identity;
  const email =
    (identity?.traits as { email?: string } | undefined)?.email ?? "";
  // Consent sessions are per subject, so this is the visitor's own grant list.
  // An issuer that cannot answer costs the section, never the page.
  const grants = identity
    ? await hydraAdmin
        .listOAuth2ConsentSessions({ subject: identity.id, pageSize: 100 })
        .catch(() => [])
    : [];
  const groupsPresent = new Set(flow.ui.nodes.map((node) => node.group));
  // Keep genuine errors; drop the "Your changes have been saved!" confirmation.
  const errorMessages = flow.ui.messages?.filter(
    (message) => message.type === "error"
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Only with a return target: "/" routes signed-in users straight back to
          this page, so an unconditional Back went nowhere. */}
      {returnTo ? (
        <Link
          className="-mb-2 flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground hover:underline"
          href={returnTo}
        >
          <CaretLeftIcon className="size-3.5" />
          Back
        </Link>
      ) : null}

      <FlowMessages messages={errorMessages} />

      {SECTIONS.filter((section) =>
        section.groups.some((group) => groupsPresent.has(group))
      ).map((section) => (
        <Card className="gap-4" key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription className="text-sm/relaxed">
              {section.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FlowForm
              groups={[...section.groups]}
              hiddenProviders={ENTERPRISE_PROVIDER_IDS}
              showMessages={false}
              ui={flow.ui}
            />
          </CardContent>
        </Card>
      ))}

      {groupsPresent.has("oidc") ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Connected accounts</CardTitle>
            <CardDescription className="text-sm/relaxed">
              Sign-in providers linked to this account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionsSection ui={flow.ui} />
          </CardContent>
        </Card>
      ) : null}

      <TenancyCard />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Applications</CardTitle>
          <CardDescription className="text-sm/relaxed">
            Applications you allowed to use this account, and what each one can
            see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationsSection sessions={grants} />
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <CardDescription className="text-sm/relaxed">
            Where you&apos;re signed in. Revoke a device to end its session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsSection currentSessionId={session?.id} sessions={sessions} />
        </CardContent>
      </Card>

      {email ? (
        <DangerZone
          action={<DangerSection email={email} />}
          description="Closing your account removes your profile, your sign-in methods and every device you are signed in on. Applications you allowed lose access. This cannot be undone."
          title="Close your account"
        />
      ) : null}
    </div>
  );
}

/**
 * The tenancy card, wrapped so the heading disappears with the section:
 * `TenancySection` returns null where no platform client is registered, and a
 * titled box with nothing in it would announce a feature this deployment does
 * not have.
 */
function TenancyCard(): ReactNode {
  const section = TenancySection();
  if (!section) {
    return null;
  }
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Tenancy</CardTitle>
        <CardDescription className="text-sm/relaxed">
          The organizations and projects you belong to.
        </CardDescription>
      </CardHeader>
      <CardContent>{section}</CardContent>
    </Card>
  );
}
