/**
 * Audit actions as a `resource → verb[]` map. An action is the pair, finite; an
 * event is one occurrence of it. Two columns rather than a fused string, so
 * either half filters on an indexed equality and an invalid pairing is a compile
 * error. Adding one means a label in `audit.labels.ts`, which is typed against
 * this map.
 */
export const AUDIT_ACTIONS = {
  application: ["created", "updated", "deleted"],
  application_secret: ["rotated"],
  console_access: ["denied"],
  identity: ["created", "deleted", "activated", "deactivated"],
  identity_credential: ["removed"],
  oauth_consent: ["granted", "denied"],
  organization: ["created", "updated", "deleted"],
  organization_member: ["added", "updated", "removed"],
  recovery_link: ["created"],
  session: ["created", "revoked"],
  staff_role: ["granted", "revoked"],
} as const;

export type AuditResource = keyof typeof AUDIT_ACTIONS;

/**
 * Discriminated union of the valid `(resource, verb)` pairs, so
 * `{ resource: "identity", verb: "rotated" }` fails to compile: `"rotated"`
 * is not a verb on `identity`.
 */
export type AuditAction = {
  [K in AuditResource]: {
    resource: K;
    verb: (typeof AUDIT_ACTIONS)[K][number];
  };
}[AuditResource];

export const AUDIT_RESOURCES = Object.keys(AUDIT_ACTIONS) as AuditResource[];

/**
 * Who acted. `user` is a person holding a session, `system` an action with no
 * caller at all (a Kratos flow hook fires under the identity's own name, but
 * a bootstrap job or a sweep has nobody to name).
 *
 * Two values rather than `platform`'s three: this service has no machine
 * callers of its own — an OAuth client acts through the person who consented,
 * and that person is the actor.
 */
export const AUDIT_ACTOR_TYPES = ["user", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/**
 * How it ended. `denied` is an authorization refusal — the actor is known and
 * the system deliberately would not let them proceed — which is a different
 * fact from `failure`, where something broke.
 */
export const AUDIT_STATUSES = ["success", "failure", "denied"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/** Whether a string is a resource this vocabulary knows. */
export function isAuditResource(value: string): value is AuditResource {
  return value in AUDIT_ACTIONS;
}

/** Whether a string is a status this vocabulary knows. */
export function isAuditStatus(value: string): value is AuditStatus {
  return (AUDIT_STATUSES as readonly string[]).includes(value);
}

/** The verbs declared for one resource, for a filter that narrows by resource. */
export function verbsOf(resource: AuditResource): readonly string[] {
  return AUDIT_ACTIONS[resource];
}

/** Every verb in the vocabulary, deduplicated and sorted — the Action filter's
 *  options when no resource narrows them. */
export const AUDIT_VERBS: readonly string[] = [
  ...new Set(Object.values(AUDIT_ACTIONS).flat()),
].sort();
