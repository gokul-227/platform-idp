import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { WarningIcon } from "@aec-craft/ui/icons";
import type { ReactNode } from "react";

/**
 * What an organization page shows when it could not get a platform token.
 *
 * Both reasons are an operator's to fix and neither is worth a retry button:
 * `unconfigured` is a deployment with no registered client, and `unauthorized`
 * means the authorization round trip ran and this browser still presents no
 * token — see `platformGate` in `lib/platform.user.ts`, which is the only thing
 * that produces either. The ordinary path reaches neither, because the round
 * trip is silent.
 */
export function PlatformUnavailable({
  reason,
}: {
  reason: "unconfigured" | "unauthorized";
}): ReactNode {
  return (
    <EmptyState
      description={
        reason === "unconfigured"
          ? "This deployment is not configured to reach the platform API, so organizations cannot be listed. An operator sets OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and PLATFORM_API_URL."
          : "Signing in to the platform API did not complete, so organizations cannot be listed. Sign out and back in; if it persists, an operator should check this app's OAuth2 client registration."
      }
      icon={WarningIcon}
      title="Organizations are unavailable"
    />
  );
}
