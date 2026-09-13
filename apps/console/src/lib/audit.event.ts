import { auditResourceLabel } from "@aec-craft/platform-id-contracts/audit/audit.labels";
import type { AuditEvent } from "@aec-craft/platform-id-db/audit";

/**
 * How one event reads on screen, in the one place the server pages, the client
 * table and the shared history card all take it from.
 *
 * Plain `.ts` and no `"use client"`: a Server Component cannot call a function
 * exported from a client module, and every one of these is needed on both sides.
 */

/** The verb half of the pair the table gives its own column, so each can be
 *  filtered alone: every deletion, whatever it was of. */
export function verbLabel(verb: string): string {
  return verb.charAt(0).toUpperCase() + verb.slice(1);
}

/**
 * What the event happened to, as a reader would name it — recorded at the
 * time, so it survives the row it names being deleted. Falls back to the raw
 * id, then to an em dash, so a subject without a captured name is still
 * something rather than a blank cell.
 */
export function itemLabel(event: {
  resourceId: string | null;
  resourceLabel: string | null;
}): string {
  return event.resourceLabel ?? event.resourceId ?? "—";
}

/**
 * Which application the event happened *through* — an OAuth client's
 * consent/token context, distinct from the item it happened *to*. When the
 * item already is an application, this stays blank rather than showing the
 * same name twice.
 */
export function applicationCellLabel(event: {
  actorType?: string | null;
  resource: string;
  applicationName: string | null;
}): string {
  if (
    event.resource === "application" ||
    event.resource === "application_secret"
  ) {
    return "—";
  }
  if (event.applicationName) {
    return event.applicationName;
  }
  // No application means the act did not arrive through one. That is a fact
  // worth stating rather than a blank: it separates "somebody did this in the
  // console" from "an application did it on their behalf".
  return event.actorType === "system" ? "System" : "Console";
}

/** How the actor authenticated, when the recording call site knew. */
export function authMethodOf(
  event: Pick<AuditEvent, "context">
): string | null {
  const method = event.context?.authMethod;
  return typeof method === "string" ? method : null;
}

/** The options a dropdown offers, built from the values actually present in the
 *  current view so it never lists a filter with nothing behind it. */
export interface FilterOption {
  label: string;
  value: string;
}

export function resourceOptions(resources: string[]): FilterOption[] {
  return resources
    .map((value) => ({ label: auditResourceLabel(value), value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function verbOptions(verbs: string[]): FilterOption[] {
  return verbs
    .map((value) => ({ label: verbLabel(value), value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const RANGE_LABEL: Record<string, string> = {
  "15m": "Last 15 minutes",
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};
