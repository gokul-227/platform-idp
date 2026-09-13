import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { authorityOf } from "@aec-craft/platform-id-sdk/identity";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import type { Identity, IdentityCredentials, Session } from "@ory/client-fetch";
import type { ReactNode } from "react";
import { ConfirmButton } from "@/components/confirm.button";
import { AUTHORITY_LABELS, type Authority } from "@/lib/authority";
import { configuredRoots } from "@/lib/roots";
import { hasSecondFactor } from "@/lib/staff";
import { IDENTITY_STATE_BADGE } from "@/lib/status.badge";
import { removeCredential } from "../actions";

/** The parts of one identity's page: what it can sign in with, where it is
 *  signed in, and what it may open. */

export const SESSION_COLUMNS = [
  { label: "Device" },
  { label: "Signed in with" },
  { label: "AAL" },
  { label: "Authenticated" },
  { label: "Expires" },
  { className: "w-0", label: "" },
] as const;

/** Second factors an admin may strip; identifiers (code) stay. */
const REMOVABLE_CREDENTIALS = ["totp", "lookup_secret", "webauthn", "passkey"];

export function CredentialRow({
  identityId,
  method,
  credential,
}: {
  identityId: string;
  method: string;
  credential: IdentityCredentials;
}): ReactNode {
  const identifiers = credential.identifiers ?? [];
  return (
    <li className="flex items-start justify-between gap-4 border-rule border-b pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-xs">{method}</span>
        {identifiers.length > 0 ? (
          <span className="truncate text-muted-foreground text-xs">
            {identifiers.join(", ")}
          </span>
        ) : null}
        {credential.created_at ? (
          <span className="text-muted-foreground text-xs">
            added {formatDate(credential.created_at)}
            {credential.version ? ` · v${credential.version}` : null}
          </span>
        ) : null}
      </div>
      {REMOVABLE_CREDENTIALS.includes(method) ? (
        <ConfirmButton
          action={removeCredential.bind(null, identityId, method)}
          confirmLabel="Remove credential"
          description={`Removes the ${method} credential. The user can re-enroll from account settings.`}
          size="sm"
          title={`Remove ${method}?`}
          variant="ghost"
        >
          Remove
        </ConfirmButton>
      ) : (
        <span className="shrink-0 text-muted-foreground text-xs">
          identifier
        </span>
      )}
    </li>
  );
}

export function SessionDeviceCell({
  session,
}: {
  session: Session;
}): ReactNode {
  const device = (session.devices ?? [])[0];
  if (!device) {
    return <span className="text-muted-foreground">unknown</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="block max-w-72 truncate text-xs">
        {device.user_agent ?? "unknown agent"}
      </span>
      <span className="font-mono text-muted-foreground text-xs">
        {[device.ip_address, device.location].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

export function sessionMethods(session: Session): string {
  const methods = (session.authentication_methods ?? [])
    .map((entry) => entry.provider ?? entry.method)
    .filter(Boolean);
  return methods.length > 0 ? methods.join(", ") : "—";
}

export function addressStatus(verified: boolean, status?: string): string {
  if (status) {
    return status;
  }
  return verified ? "verified" : "pending";
}

/**
 * Here rather than beside the grant: the fix is a second factor, and this is
 * where second factors are listed.
 */
export function SecondFactorNote({
  identity,
}: {
  identity: Identity;
}): ReactNode {
  if (
    authorityOf(identity, configuredRoots()) !== "admin" ||
    hasSecondFactor(identity)
  ) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-sm">
      No second factor enrolled, so the console still refuses them. It requires
      two, and only they can add one in their own account settings.
    </p>
  );
}

/**
 * What this identity *is*, beside its name. Only the exception gets ink: every
 * account is active, so a badge on each says nothing, and the deactivated one is
 * what somebody needs to notice.
 */
export function IdentityBadges({
  authority,
  isActive,
}: {
  authority: Authority | null;
  isActive: boolean;
}): ReactNode {
  const state = isActive
    ? IDENTITY_STATE_BADGE.active
    : IDENTITY_STATE_BADGE.inactive;
  return (
    <>
      {authority ? (
        <Badge variant={authority === "root" ? "default" : "outline"}>
          {AUTHORITY_LABELS[authority]}
        </Badge>
      ) : null}
      <Badge {...state}>{state.label}</Badge>
    </>
  );
}
