"use server";

import {
  DEFAULT_SCHEMA,
  STAFF_SCHEMA,
} from "@aec-craft/platform-id-contracts/identity/identity.schema";
import { emailOf } from "@aec-craft/platform-id-sdk/identity";
import type { DeleteIdentityCredentialsTypeEnum } from "@ory/client-fetch";
import { revalidatePath } from "next/cache";
import { recordConsoleEvent } from "@/lib/audit.record";
import type { Authority } from "@/lib/authority";
import { identityAdmin } from "@/lib/kratos.admin";
import { removePlatformProfile } from "@/lib/platform.profile";
import { assertAccessChange, getActor } from "@/lib/staff";

/**
 * Each of these throws on failure and the error boundary renders it. None calls
 * `redirect()`: Next (16.1.6) renders an action's redirect through an internal
 * fetch whose forwarded cookie header is rebuilt with `encodeURIComponent`, so
 * the padded session cookie fails whoami and the sign-in bounce streams back as
 * the page. The caller navigates once the promise resolves.
 */

export async function createIdentity(formData: FormData): Promise<string> {
  const email = String(formData.get("email") ?? "").trim();
  const first = String(formData.get("first") ?? "").trim();
  const last = String(formData.get("last") ?? "").trim();
  const identity = await identityAdmin.createIdentity({
    createIdentityBody: {
      schema_id: DEFAULT_SCHEMA,
      traits: { email, name: { first, last } },
      verifiable_addresses: [
        { status: "completed", value: email, verified: true, via: "email" },
      ],
    },
  });
  await recordConsoleEvent({
    resource: "identity",
    verb: "created",
    resourceId: identity.id,
    resourceLabel: email,
  });
  revalidatePath("/identities");
  return identity.id;
}

/**
 * The platform profile first, the identity only if it agreed: the platform
 * refuses to remove a last owner, and the other order leaves the identity gone
 * and its profile uncleanable.
 */
export async function deleteIdentity(id: string): Promise<void> {
  const target = await identityAdmin.getIdentity({ id });
  await removePlatformProfile(id);
  await identityAdmin.deleteIdentity({ id });
  await recordConsoleEvent({
    resource: "identity",
    verb: "deleted",
    resourceId: id,
    resourceLabel: emailOf(target),
  });
  revalidatePath("/identities");
}

export async function updateIdentityState(
  id: string,
  state: "active" | "inactive"
): Promise<void> {
  const target = await identityAdmin.patchIdentity({
    id,
    jsonPatch: [{ op: "replace", path: "/state", value: state }],
  });
  await recordConsoleEvent({
    resource: "identity",
    verb: state === "active" ? "activated" : "deactivated",
    resourceId: id,
    resourceLabel: emailOf(target),
  });
  revalidatePath(`/identities/${id}`);
}

export async function revokeIdentitySessions(id: string): Promise<void> {
  const target = await identityAdmin.getIdentity({ id });
  await identityAdmin.deleteIdentitySessions({ id });
  await recordConsoleEvent({
    resource: "session",
    verb: "revoked",
    payload: { scope: "all" },
    resourceId: id,
    resourceLabel: emailOf(target),
  });
  revalidatePath(`/identities/${id}`);
}

export async function revokeSession(
  identityId: string,
  sessionId: string
): Promise<void> {
  const target = await identityAdmin.getIdentity({ id: identityId });
  await identityAdmin.disableSession({ id: sessionId });
  await recordConsoleEvent({
    resource: "session",
    verb: "revoked",
    payload: { scope: "one", revokedSessionId: sessionId },
    resourceId: identityId,
    resourceLabel: emailOf(target),
  });
  revalidatePath(`/identities/${identityId}`);
}

export async function removeCredential(
  id: string,
  type: string
): Promise<void> {
  const target = await identityAdmin.getIdentity({ id });
  await identityAdmin.deleteIdentityCredentials({
    id,
    type: type as DeleteIdentityCredentialsTypeEnum,
  });
  await recordConsoleEvent({
    resource: "identity_credential",
    verb: "removed",
    payload: { credentialType: type },
    resourceId: id,
    resourceLabel: emailOf(target),
  });
  revalidatePath(`/identities/${id}`);
}

export interface RecoveryLinkResult {
  code?: string;
  expiresAt?: string;
  link?: string;
}

/**
 * The code variant matches `selfservice.flows.recovery.use: code`; the link
 * admin endpoint 400s under that config.
 */
export async function createRecoveryLink(
  _previous: RecoveryLinkResult,
  formData: FormData
): Promise<RecoveryLinkResult> {
  const id = String(formData.get("id") ?? "");
  const target = await identityAdmin.getIdentity({ id });
  const result = await identityAdmin.createRecoveryCodeForIdentity({
    createRecoveryCodeForIdentityBody: { identity_id: id },
  });
  await recordConsoleEvent({
    resource: "recovery_link",
    verb: "created",
    resourceId: id,
    resourceLabel: emailOf(target),
  });
  return {
    code: result.recovery_code,
    link: result.recovery_link,
    expiresAt: result.expires_at?.toISOString(),
  };
}

/**
 * Grant, change or revoke console access; `null` revokes. One PATCH for both
 * fields, so an identity can never sit on the staff schema without a role or
 * carry a role while off it.
 */
export async function updateConsoleAccess(
  id: string,
  next: Authority | null
): Promise<void> {
  const [actor, target] = await Promise.all([
    getActor(),
    identityAdmin.getIdentity({ id }),
  ]);
  assertAccessChange(actor, target, next);
  await identityAdmin.patchIdentity({
    id,
    jsonPatch: [
      {
        op: "replace",
        path: "/schema_id",
        value: next ? STAFF_SCHEMA : DEFAULT_SCHEMA,
      },
      {
        op: "replace",
        path: "/metadata_public",
        value: next === "admin" ? { staffRole: next } : {},
      },
    ],
  });
  await recordConsoleEvent({
    resource: "staff_role",
    verb: next ? "granted" : "revoked",
    payload: { after: { access: next } },
    resourceId: id,
    resourceLabel: emailOf(target),
  });
  revalidatePath(`/identities/${id}`);
  revalidatePath("/identities");
}
