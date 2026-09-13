/**
 * How each audit action reads to an operator, keyed `${resource}.${verb}`. Written
 * out rather than derived, because a mechanical rendering gives "Identity
 * created" where the console says "User created". Typed against the vocabulary,
 * so a verb without a label fails to compile.
 */
import type {
  AUDIT_ACTIONS,
  AuditActorType,
  AuditResource,
  AuditStatus,
} from "./audit.vocabulary";

/** Every valid `${resource}.${verb}` key. */
/** First character of a label, for title-casing an unlisted value. */
const FIRST_CHARACTER = /^./;

export type AuditActionKey = {
  [K in AuditResource]: `${K}.${(typeof AUDIT_ACTIONS)[K][number]}`;
}[AuditResource];

export const AUDIT_ACTION_LABELS: Readonly<Record<AuditActionKey, string>> =
  Object.freeze({
    "application.created": "Application created",
    "application.updated": "Application updated",
    "application.deleted": "Application deleted",
    "application_secret.rotated": "Client secret rotated",
    "console_access.denied": "Console access refused",
    "identity.created": "User created",
    "identity.deleted": "User deleted",
    "identity.activated": "User activated",
    "identity.deactivated": "User deactivated",
    "identity_credential.removed": "Credential removed",
    "oauth_consent.granted": "Consent granted",
    "oauth_consent.denied": "Consent declined",
    "recovery_link.created": "Recovery link issued",
    "session.created": "Signed in",
    "session.revoked": "Session revoked",
    "organization.created": "Organization created",
    "organization.updated": "Organization renamed",
    "organization.deleted": "Organization deleted",
    "organization_member.added": "Member added",
    "organization_member.updated": "Standing changed",
    "organization_member.removed": "Member removed",
    "staff_role.granted": "Staff role granted",
    "staff_role.revoked": "Staff role revoked",
  });

/**
 * Label for one action. Falls back to `"<resource> <verb>"` so an action that
 * ships ahead of its label still renders as words rather than a blank cell.
 */
export function auditActionLabel(action: {
  resource: string;
  verb: string;
}): string {
  return (
    AUDIT_ACTION_LABELS[
      `${action.resource}.${action.verb}` as AuditActionKey
    ] ?? `${action.resource} ${action.verb}`
  );
}

/**
 * What a resource is called on screen — the "Item type" filter's options.
 * `identity` reads as "User" for the same reason its actions do.
 */
export const AUDIT_RESOURCE_LABELS: Readonly<Record<AuditResource, string>> =
  Object.freeze({
    application: "Application",
    application_secret: "Client secret",
    console_access: "Console access",
    identity: "User",
    identity_credential: "Credential",
    oauth_consent: "Consent",
    recovery_link: "Recovery link",
    session: "Session",
    organization: "Organization",
    organization_member: "Member",
    staff_role: "Staff role",
  });

/** Title-cases an unknown resource rather than showing a raw column value. */
export function auditResourceLabel(resource: string): string {
  return (
    AUDIT_RESOURCE_LABELS[resource as AuditResource] ??
    resource
      .replaceAll("_", " ")
      .replace(FIRST_CHARACTER, (c) => c.toUpperCase())
  );
}

export const AUDIT_STATUS_LABELS: Readonly<Record<AuditStatus, string>> =
  Object.freeze({
    success: "Success",
    failure: "Failed",
    denied: "Denied",
  });

export function auditStatusLabel(status: string): string {
  return (
    AUDIT_STATUS_LABELS[status as AuditStatus] ??
    status.replace(FIRST_CHARACTER, (c) => c.toUpperCase())
  );
}

export const AUDIT_ACTOR_TYPE_LABELS: Readonly<Record<AuditActorType, string>> =
  Object.freeze({
    user: "User",
    system: "System",
  });

/**
 * Kratos's own credential vocabulary, bounded by the identity schema rather
 * than by this repo — how somebody signed in, recorded on a `session.created`
 * event's context.
 */
export const AUTH_METHOD_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    code: "an email code",
    link: "a magic link",
    lookup_secret: "a recovery code",
    oidc: "a linked account",
    passkey: "a passkey",
    password: "a password",
    totp: "an authenticator app",
    webauthn: "a security key",
  });

export function authMethodLabel(value: unknown): string {
  if (typeof value !== "string" || !value) {
    return "an unrecorded method";
  }
  return AUTH_METHOD_LABELS[value] ?? value;
}
