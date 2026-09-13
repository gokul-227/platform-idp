import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { DesktopIcon, DeviceMobileIcon } from "@aec-craft/ui/icons";
import type { Session, SessionDevice } from "@ory/client-fetch";
import type { ReactNode } from "react";
import { revokeOtherSessions, revokeSession } from "./sessions.actions";

const UA_MOBILE_REGEX = /mobile|android|iphone|ipad/i;
const UA_BROWSER_REGEX = /(Firefox|Edg|Chrome|Safari)/;
const UA_OS_REGEX = /(Windows|Mac OS X|Android|iPhone|iPad|Linux)/;

/** Rough phone-vs-desktop guess from the UA; a hint, not a parser. */
function isMobile(device?: SessionDevice): boolean {
  return UA_MOBILE_REGEX.test(device?.user_agent ?? "");
}

/** Trim a raw UA down to the browser/OS names worth showing. */
function deviceLabel(device?: SessionDevice): string {
  const ua = device?.user_agent ?? "";
  if (!ua) {
    return "Unknown device";
  }
  const browser =
    UA_BROWSER_REGEX.exec(ua)?.[1]?.replace("Edg", "Edge") ?? "Browser";
  const os = UA_OS_REGEX.exec(ua)?.[1] ?? "";
  return os ? `${browser} on ${os.replace("Mac OS X", "macOS")}` : browser;
}

export function SessionsSection({
  sessions,
  currentSessionId,
}: {
  sessions: Session[];
  currentSessionId?: string | undefined;
}): ReactNode {
  if (sessions.length === 0) {
    return <p className="text-muted-foreground text-sm">No active sessions.</p>;
  }

  const hasOthers = sessions.some((session) => session.id !== currentSessionId);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col">
        {sessions.map((session) => {
          const device = session.devices?.[0];
          const isCurrent = session.id === currentSessionId;
          const Icon = isMobile(device) ? DeviceMobileIcon : DesktopIcon;
          return (
            <li
              className="flex items-center gap-3 border-rule border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
              key={session.id}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-sm">
                  {deviceLabel(device)}
                  {isCurrent ? (
                    <Badge variant="outline">This device</Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {device?.ip_address ? `${device.ip_address} · ` : ""}
                  signed in {formatDate(session.authenticated_at)}
                </span>
              </div>
              {isCurrent ? null : (
                <form action={revokeSession} className="ml-auto">
                  <input name="id" type="hidden" value={session.id} />
                  <Button size="sm" type="submit" variant="outline">
                    Revoke
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {hasOthers ? (
        <form action={revokeOtherSessions}>
          <Button size="sm" type="submit" variant="outline">
            Sign out all other devices
          </Button>
        </form>
      ) : null}
    </div>
  );
}
