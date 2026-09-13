import { type AuditEvent, listEvents } from "@aec-craft/platform-id-db/audit";

/**
 * The read layer behind every contextual "Activity" section: thin wrappers around
 * `listEvents`, so a detail page never writes its own query or repeats a filter
 * name. `audit.record.ts` is the other half.
 *
 * Nothing a client component imports may reach this: it pulls the db package,
 * and with it Node-only `pg`, which fails the build rather than tree-shaking.
 */

/**
 * How many rows the preview on a detail page shows. Small on purpose: the card
 * answers "what happened here lately" at a glance, and one that scrolls has
 * stopped previewing and started being the table it links to.
 */
const DETAIL_PAGE_LIMIT = 5;

type Feed = Promise<{ events: AuditEvent[]; total: number }>;

/** Everything recorded against one subject, regardless of who did it. */
export function listEventsForResource(
  resource: string,
  resourceId: string,
  limit = DETAIL_PAGE_LIMIT
): Feed {
  return listEvents({ limit, resource, resourceId });
}

/** Everything one identity did, across every subject. A different question
 *  than "what happened to this identity", which is `listEventsForResource`. */
export function listEventsForActor(
  actorId: string,
  limit = DETAIL_PAGE_LIMIT
): Feed {
  return listEvents({ actorId, limit });
}

/** Everything else under the same session — what a details page wants when two
 *  events share a visit but not a subject or actor. */
export function listEventsForSession(
  sessionId: string,
  limit = DETAIL_PAGE_LIMIT
): Feed {
  return listEvents({ limit, sessionId });
}

/** Everything else through the same OAuth client. */
export function listEventsForApplication(
  applicationId: string,
  limit = DETAIL_PAGE_LIMIT
): Feed {
  return listEvents({ applicationId, limit });
}

/**
 * A person's own Activity tab needs both halves: what an operator did *to*
 * them (they are the subject) and what they did themselves (they are the
 * actor). Neither wrapper alone answers "everything involving this person".
 */
export async function listEventsForIdentity(
  identityId: string,
  limit = DETAIL_PAGE_LIMIT
): Feed {
  const [asResource, asActor] = await Promise.all([
    listEventsForResource("identity", identityId, limit),
    listEventsForActor(identityId, limit),
  ]);
  const merged = new Map(
    [...asResource.events, ...asActor.events].map((event) => [event.id, event])
  );
  const events = [...merged.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
  return {
    events,
    // An upper bound: an event where this identity is both actor and subject
    // is counted twice. Exact would need a single OR query, which is not worth
    // it for a number beside a "View all" link.
    total: asResource.total + asActor.total,
  };
}
