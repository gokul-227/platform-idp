import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { Button } from "@aec-craft/ui/components/primitives/button";
import type { OAuth2ConsentSession } from "@ory/client-fetch";
import type { ReactNode } from "react";
import { scopeLabel } from "@/lib/scope";
import { revokeApplication } from "./applications.actions";

/**
 * One row per application, not per grant. Hydra records a consent session each
 * time somebody agrees, so an application signed into from two browsers appears
 * twice; revoking is scoped to the client, so showing it twice would offer the
 * same button under two rows and leave the second looking like it failed.
 */
interface Grant {
  clientId: string;
  name: string;
  scopes: string[];
  since?: Date | undefined;
}

function groupByClient(sessions: OAuth2ConsentSession[]): Grant[] {
  const byClient = new Map<string, Grant>();
  for (const consent of sessions) {
    const client = consent.consent_request?.client;
    const clientId = client?.client_id;
    if (!clientId) {
      continue;
    }
    const held = byClient.get(clientId);
    const scopes = consent.grant_scope ?? [];
    if (held) {
      held.scopes = [...new Set([...held.scopes, ...scopes])];
      if (
        consent.handled_at &&
        (!held.since || consent.handled_at < held.since)
      ) {
        held.since = consent.handled_at;
      }
      continue;
    }
    byClient.set(clientId, {
      clientId,
      name: client?.client_name || clientId,
      scopes: [...scopes],
      since: consent.handled_at,
    });
  }
  return [...byClient.values()];
}

export function ApplicationsSection({
  sessions,
}: {
  sessions: OAuth2ConsentSession[];
}): ReactNode {
  const grants = groupByClient(sessions);

  if (grants.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You have not signed in to any application with this account yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {grants.map((grant) => (
        <li
          className="flex items-center gap-3 border-rule border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          key={grant.clientId}
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">{grant.name}</span>
            {/* One muted line, as on a device: a badge each read as four
                separate grants, and the sentences they carried stopped being
                scannable at the second application. */}
            <span className="text-muted-foreground text-xs">
              {[
                ...grant.scopes.map(scopeLabel),
                grant.since ? `allowed ${formatDate(grant.since)}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <form action={revokeApplication} className="ml-auto">
            <input
              name="client"
              readOnly
              type="hidden"
              value={grant.clientId}
            />
            <Button size="sm" type="submit" variant="outline">
              Revoke
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
