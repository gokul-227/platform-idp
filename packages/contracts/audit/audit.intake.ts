/**
 * The body an internal audit receiver accepts, for the two callers that cannot
 * record in-process: Kratos, which speaks only outbound HTTP, and the staff
 * guard, which runs at the edge.
 *
 * camelCase on the wire, and `audit.jsonnet` is written to match. Validated
 * rather than trusted: the secret proves the caller, not the shape, and the body
 * reaches an insert.
 */
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  type AuditAction,
  type AuditActorType,
  type AuditStatus,
  isAuditResource,
  isAuditStatus,
} from "./audit.vocabulary";

export type AuditIntakeBody = AuditAction & {
  actorType?: AuditActorType;
  actorIdentityId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  status?: AuditStatus;
  resourceId?: string | null;
  resourceLabel?: string | null;
  applicationId?: string | null;
  applicationName?: string | null;
  organization?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

export type AuditIntakeResult =
  | { ok: true; value: AuditIntakeBody }
  | { ok: false; error: string };

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === "string" ? value || null : undefined;
}

function optionalBag(
  value: unknown
): Record<string, unknown> | undefined | null {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return;
}

/**
 * Every text field is normalised to `string | null` — a hook that renders a
 * missing trait as JSON `null` and one that omits the key entirely mean the
 * same thing here, and neither should reach the insert as `undefined`.
 */
export function parseAuditIntake(body: unknown): AuditIntakeResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const input = body as Record<string, unknown>;

  const resource = input.resource;
  if (typeof resource !== "string" || !isAuditResource(resource)) {
    return { ok: false, error: "unknown resource" };
  }
  const verb = input.verb;
  if (
    typeof verb !== "string" ||
    !(AUDIT_ACTIONS[resource] as readonly string[]).includes(verb)
  ) {
    return { ok: false, error: `unknown verb for resource ${resource}` };
  }

  const status = input.status;
  if (
    status !== undefined &&
    !(typeof status === "string" && isAuditStatus(status))
  ) {
    return { ok: false, error: "unknown status" };
  }

  const actorType = input.actorType;
  if (
    actorType !== undefined &&
    !(
      typeof actorType === "string" &&
      (AUDIT_ACTOR_TYPES as readonly string[]).includes(actorType)
    )
  ) {
    return { ok: false, error: "unknown actorType" };
  }

  const texts = {
    actorIdentityId: optionalText(input.actorIdentityId),
    actorEmail: optionalText(input.actorEmail),
    actorName: optionalText(input.actorName),
    resourceId: optionalText(input.resourceId),
    resourceLabel: optionalText(input.resourceLabel),
    applicationId: optionalText(input.applicationId),
    applicationName: optionalText(input.applicationName),
    organization: optionalText(input.organization),
    sessionId: optionalText(input.sessionId),
    requestId: optionalText(input.requestId),
    ip: optionalText(input.ip),
    userAgent: optionalText(input.userAgent),
  };
  for (const [key, value] of Object.entries(texts)) {
    if (value === undefined) {
      return { ok: false, error: `${key} must be a string` };
    }
  }

  const context = optionalBag(input.context);
  if (context === undefined) {
    return { ok: false, error: "context must be an object" };
  }
  const payload = optionalBag(input.payload);
  if (payload === undefined) {
    return { ok: false, error: "payload must be an object" };
  }

  return {
    ok: true,
    value: {
      resource,
      verb,
      ...(status ? { status: status as AuditStatus } : {}),
      ...(actorType ? { actorType: actorType as AuditActorType } : {}),
      ...(texts as Record<string, string | null>),
      context,
      payload,
    } as AuditIntakeBody,
  };
}
