// Real data: Kratos's own listMySessions/disableMySession — "revoke" ends
// the session, never deletes the identity. Browser/OS labeling below is a
// small local parser (lib/user-agent.ts), not a new dependency; AAL and
// sign-in method come straight from the same Session object Kratos already
// returns, not a second lookup.

import type { Session } from "@ory/client-fetch";
import type { ReactNode } from "react";

import { revokeAllMyOtherSessionsAction, revokeSessionAction } from "@/app/(account)/settings/actions";
import { Badge } from "@/components/vendor/ui/badge";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { DeviceIcon } from "@/components/device-icon";
import { parseUserAgent } from "@/lib/user-agent";

function formatDate(value?: Date): string {
  if (!value) return "unknown time";
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function SessionsSection({
  sessions,
  currentSessionId,
}: {
  sessions: Session[];
  currentSessionId?: string;
}): ReactNode {
  if (sessions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No active sessions — this would only happen if the current session couldn&apos;t be
        loaded; you are signed in right now, so at least one always exists in practice.
      </p>
    );
  }

  const otherSessionsCount = sessions.filter((s) => s.id !== currentSessionId).length;

  return (
    <div className="flex flex-col gap-3">
      {otherSessionsCount > 0 ? (
        <form action={revokeAllMyOtherSessionsAction} className="flex justify-end">
          <ConfirmSubmitButton
            description={`This signs you out of ${otherSessionsCount} other device${otherSessionsCount === 1 ? "" : "s"} immediately — this device stays signed in. Use this after using a shared or public computer, or if you suspect another device is compromised.`}
            title="Sign out of all other devices?"
            variant="outline"
          >
            Sign out everywhere else
          </ConfirmSubmitButton>
        </form>
      ) : null}
      <ul className="flex flex-col">
      {sessions.map((session) => {
        const device = session.devices?.[0];
        const { browser, deviceType, os } = parseUserAgent(device?.user_agent);
        const isCurrent = session.id === currentSessionId;
        const method = session.authentication_methods?.at(-1)?.method;
        const aal = session.authenticator_assurance_level;

        return (
          <li
            className="flex items-center gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
            key={session.id}
          >
            <DeviceIcon deviceType={deviceType} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm">
                {browser} on {os}
                {isCurrent ? <Badge variant="outline">This device</Badge> : null}
              </span>
              <span className="text-muted-foreground text-xs">
                {device?.ip_address ? `${device.ip_address} · ` : ""}
                signed in {formatDate(session.authenticated_at)}
                {method ? ` · via ${method}` : ""}
                {aal ? ` · ${aal.toUpperCase()}` : ""}
              </span>
              {session.expires_at ? (
                <span className="text-muted-foreground text-xs">
                  Expires {formatDate(session.expires_at)}
                </span>
              ) : null}
            </div>
            {isCurrent ? null : (
              <form action={revokeSessionAction} className="ml-auto">
                <ConfirmSubmitButton
                  description="This immediately ends that session — anyone using it will be signed out and must log in again. It does not affect this device or delete any data."
                  name="id"
                  title="Revoke this session?"
                  value={session.id}
                  variant="outline"
                >
                  Revoke
                </ConfirmSubmitButton>
              </form>
            )}
          </li>
        );
      })}
      </ul>
    </div>
  );
}
