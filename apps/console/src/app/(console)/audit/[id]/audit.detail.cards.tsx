import {
  auditActionLabel,
  auditResourceLabel,
  auditStatusLabel,
  authMethodLabel,
} from "@aec-craft/platform-id-contracts/audit/audit.labels";
import { formatTimestamp } from "@aec-craft/platform-id-contracts/common/format";
import type { AuditEvent } from "@aec-craft/platform-id-db/audit";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@aec-craft/ui/components/primitives/collapsible";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy.button";
import {
  DetailCard,
  DetailJson,
  DetailList,
  DetailRow,
} from "@/components/detail.list";
import { authMethodOf } from "@/lib/audit.event";
import { parseUserAgent } from "@/lib/user-agent";
import {
  CHANGED_FIELD_LABEL,
  fieldChangeValue,
  isFieldChange,
  NAMED_CONTEXT_KEYS,
  NAMED_PAYLOAD_KEYS,
  redactSecrets,
  SECRET_KEY_PATTERN,
  titleCase,
} from "./audit.detail.values";

/** One card per question an operator asks of a single event. */

/**
 * What context and payload add beyond the cards above, as key/value rows: never
 * raw JSON, and never a key matching `SECRET_KEY_PATTERN`.
 */
export function AdditionalDetails({
  context,
  payload,
}: {
  context: Record<string, unknown>;
  payload: Record<string, unknown>;
}): ReactNode {
  const extra: Record<string, unknown> = {
    ...Object.fromEntries(
      Object.entries(context).filter(([key]) => !NAMED_CONTEXT_KEYS.has(key))
    ),
    ...Object.fromEntries(
      Object.entries(payload).filter(([key]) => !NAMED_PAYLOAD_KEYS.has(key))
    ),
  };
  const rows = Object.keys(extra)
    .filter((key) => !SECRET_KEY_PATTERN.test(key))
    .map((key) => {
      const value = extra[key];
      return {
        label: titleCase(key),
        value:
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : JSON.stringify(value),
      };
    });

  if (rows.length === 0) {
    return null;
  }

  return (
    <DetailCard title="Additional details">
      <DetailList>
        {rows.map((row) => (
          <DetailRow key={row.label} label={row.label} value={row.value} />
        ))}
      </DetailList>
    </DetailCard>
  );
}

/**
 * Before/after per changed field, as `payload.changes` recorded it. Not a diff
 * reconstructed from a snapshot, which this audit model does not store.
 */
export function ChangesCard({ event }: { event: AuditEvent }): ReactNode {
  const changes = event.payload?.changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const rows = changes.filter(isFieldChange);
  if (rows.length === 0) {
    return null;
  }
  return (
    <DetailCard title="Changes">
      <DetailList>
        {rows.map((change) => (
          <DetailRow
            key={change.field}
            label={CHANGED_FIELD_LABEL[change.field] ?? titleCase(change.field)}
            value={`${fieldChangeValue(change.from)} → ${fieldChangeValue(change.to)}`}
          />
        ))}
      </DetailList>
    </DetailCard>
  );
}

/**
 * How the person authenticated, under its own heading rather than inside
 * Request, which is about the HTTP call.
 */
export function AuthenticationCard({
  event,
}: {
  event: AuditEvent;
}): ReactNode {
  const method = authMethodOf(event);
  const credentialType = event.payload?.credentialType;
  if (typeof method !== "string" && typeof credentialType !== "string") {
    return null;
  }
  return (
    <DetailCard title="Authentication">
      <DetailList>
        {typeof method === "string" ? (
          <DetailRow label="Method" value={authMethodLabel(method)} />
        ) : null}
        {typeof credentialType === "string" ? (
          <DetailRow label="Credential type" value={credentialType} />
        ) : null}
      </DetailList>
    </DetailCard>
  );
}

/**
 * One card for "what happened": activity, item, application, result, when.
 * Application is what the event happened *through*, Item what it happened *to*,
 * so an application's own event leaves Application blank rather than repeating
 * the name. Never "Resource type"/"Resource ID", which are column names.
 */
export function ActivitySummaryCard({
  item,
  event,
}: {
  item: string;
  event: AuditEvent;
}): ReactNode {
  const showApplication =
    event.applicationId && event.resource !== "application";
  return (
    <DetailCard title="Activity summary">
      <DetailList>
        <DetailRow label="Activity" value={auditActionLabel(event)} />
        <DetailRow
          label="Item type"
          value={auditResourceLabel(event.resource)}
        />
        <DetailRow label="Item" value={item === "—" ? undefined : item} />
        <DetailRow label="Item ID" mono value={event.resourceId} />
        {showApplication ? (
          <DetailRow
            label="Application"
            value={
              <Link
                className="underline hover:text-foreground"
                href={`/applications/${event.applicationId}`}
              >
                {event.applicationName ?? event.applicationId}
              </Link>
            }
          />
        ) : null}
        {showApplication ? (
          <DetailRow label="Application ID" mono value={event.applicationId} />
        ) : null}
        <DetailRow label="Result" value={auditStatusLabel(event.status)} />
        <DetailRow
          label="Date & time"
          value={formatTimestamp(event.createdAt)}
        />
        <DetailRow label="Event ID" mono value={event.id} />
      </DetailList>
    </DetailCard>
  );
}

export function UserCard({ event }: { event: AuditEvent }): ReactNode {
  const userValue = event.actorIdentityId ? (
    <Link
      className="underline hover:text-foreground"
      href={`/identities/${event.actorIdentityId}`}
    >
      {event.actorName ?? event.actorEmail ?? event.actorIdentityId}
    </Link>
  ) : (
    (event.actorName ?? event.actorEmail ?? "System")
  );
  return (
    <DetailCard title="User">
      <DetailList>
        <DetailRow label="Name" value={userValue} />
        <DetailRow label="Email" value={event.actorEmail} />
        <DetailRow label="Identity ID" mono value={event.actorIdentityId} />
      </DetailList>
    </DetailCard>
  );
}

/** Device/browser/OS are all best-effort: null (rendered as nothing, via
 *  DetailRow's own empty-hides-the-row behavior) whenever the underlying
 *  capture had nothing to say, never guessed to fill the row. */
export function RequestCard({ event }: { event: AuditEvent }): ReactNode {
  const { browser, deviceType, os } = parseUserAgent(event.userAgent);
  return (
    <DetailCard title="Request">
      <DetailList>
        <DetailRow
          label="IP address"
          mono
          value={event.ip ?? "Not available"}
        />
        <DetailRow label="Session ID" mono value={event.sessionId} />
        <DetailRow label="Request ID" mono value={event.requestId} />
        <DetailRow label="Device" value={deviceType} />
        <DetailRow label="Browser" value={browser} />
        <DetailRow label="Operating system" value={os} />
        <DetailRow label="User agent" value={event.userAgent} />
      </DetailList>
    </DetailCard>
  );
}

/** "Reason", not "Failure": the field carries both a refusal (`denied`) and a
 *  fault (`failure`), and both answer why this did not succeed. */
export function ReasonCard({ event }: { event: AuditEvent }): ReactNode {
  const reason = event.context?.reason;
  if (event.status === "success" || typeof reason !== "string") {
    return null;
  }
  return (
    <DetailCard title="Reason">
      <DetailList>
        <DetailRow label="Reason" value={reason} />
      </DetailList>
    </DetailCard>
  );
}

/** Collapsed by default: the raw record, for the rare case the cards above
 *  don't already answer the question. Never a first read. */
export function TechnicalDetailsCard({
  event,
}: {
  event: AuditEvent;
}): ReactNode {
  const raw = redactSecrets({
    applicationId: event.applicationId,
    applicationName: event.applicationName,
    context: event.context,
    id: event.id,
    payload: event.payload,
    resource: event.resource,
    status: event.status,
    verb: event.verb,
  });
  return (
    <DetailCard
      action={<CopyButton value={JSON.stringify(raw, null, 2)} />}
      title="Technical event data"
    >
      <Collapsible>
        <CollapsibleTrigger
          className="text-muted-foreground text-xs underline hover:text-foreground"
          render={<button type="button" />}
        >
          Show raw event data
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <DetailJson value={raw} />
        </CollapsibleContent>
      </Collapsible>
    </DetailCard>
  );
}
