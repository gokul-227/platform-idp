import type { ReactNode } from "react";

import { getBrowserFlow, isRegistrationDisabled } from "@/adapters/kratos-flow";
import { AuthShell } from "@/components/auth-shell";
import { FlowForm } from "@/components/flow-form";
import type { FlowSearchParams } from "@/types/flow";

// enterprise-user.schema.json's real trait groups beyond email + first/last
// name are all optional (tech-lead request: show only email + name on
// registration) — dropped from the rendered form entirely, not deleted from
// the schema/Kratos config. See components/flow-form.tsx's
// excludeNamePrefixes doc for why this is safe to just not submit at all
// (unlike profile-section.tsx's hidden-input passthrough, which exists to
// preserve values that already have one).
const REGISTRATION_EXCLUDED_PREFIXES = [
  "traits.username",
  "traits.phone",
  "traits.avatar",
  "traits.locale",
  "traits.timezone",
  "traits.organization.",
  "traits.consent.",
  "traits.status",
  "traits.metadata",
];

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const params = await searchParams;

  // Only probe when there's no flow id yet — an existing ?flow=<id> means
  // Kratos already minted a real flow for this browser (only possible
  // while registration was enabled), so trust it unconditionally rather
  // than adding a redundant round-trip to every registration page render.
  // Without this check, getBrowserFlow's own id-less path (see
  // adapters/kratos-flow.ts) sends the browser straight to Kratos's own
  // self-service init endpoint, which — confirmed live, with registration
  // disabled — 303-redirects to https://www.ory.sh/kratos/docs/fallback/error
  // (Kratos's hardcoded fallback error page, since this app never
  // configured selfservice.flows.error.ui_url), silently taking the user
  // off this platform entirely. This check keeps that from ever happening.
  if (!params.flow && (await isRegistrationDisabled())) {
    return (
      <AuthShell title="Create account">
        <p className="text-muted-foreground text-sm">
          Registration is currently disabled. Contact an administrator if you need an account.
        </p>
      </AuthShell>
    );
  }

  const flow = await getBrowserFlow("registration", params);

  return (
    <AuthShell title="Create account">
      <FlowForm excludeNamePrefixes={REGISTRATION_EXCLUDED_PREFIXES} flow={flow} />
    </AuthShell>
  );
}
