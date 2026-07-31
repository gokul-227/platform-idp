// Admin API clients — server-side only, never exposed to the browser.
// Ported directly from .reference/platform-ory-id-spike/apps/id/src/lib/
// {hydra,kratos.admin,keto}.ts — same clients, same shape. This console is
// unauthenticated, same as that reference spike: a real deployment must put
// it behind the platform's own operator auth and keep the admin ports off
// the public network (Hydra :4445, Kratos :4434, Keto :4467 are already
// internal-Docker-network-only in this repo's Compose files — see
// docker-compose.yml — but the Next.js pages calling them are currently
// reachable at /console/* with no additional check of their own).

import "server-only";

import { Configuration, CourierApi, IdentityApi, OAuth2Api } from "@ory/client-fetch";

import { getEnv } from "@/config/env";

export const identityAdmin = new IdentityApi(
  new Configuration({ basePath: getEnv().kratosAdminUrl }),
);

export const hydraAdmin = new OAuth2Api(
  new Configuration({ basePath: getEnv().hydraAdminUrl }),
);

// Kratos's real courier message log — GET-only (list/get). Confirmed via
// the SDK itself: CourierApi has no resend/retry method, and Kratos OSS's
// admin API has no such endpoint — every self-service email
// (registration/recovery/verification) that Kratos's own courier sends
// lands here with its real delivery status.
export const courierAdmin = new CourierApi(
  new Configuration({ basePath: getEnv().kratosAdminUrl }),
);

export interface SubjectSetRef {
  namespace: string;
  object: string;
  relation: string;
}

export interface RelationTuple {
  namespace: string;
  object: string;
  relation: string;
  subject_id?: string;
  subject_set?: SubjectSetRef;
}

export interface CheckQuery {
  namespace: string;
  object: string;
  relation: string;
  subject: string;
}

/**
 * Namespaces actually loaded by ory/keto/config/keto.yaml (the real running
 * Keto). ory/keto/namespaces/namespaces.ts defines matching `related`/
 * `permits` shapes for the same six names, but per this repo's own
 * ai-handoff notes there's no compile/apply step wiring that OPL into Keto
 * yet — only the plain namespace list below is actually live. An earlier
 * pass here listed User/Group/Org/Project/Element, none of which match
 * keto.yaml; fixed to the real six.
 */
export const KETO_NAMESPACES = [
  "Organization",
  "Project",
  "Team",
  "Application",
  "User",
  "Resource",
] as const;

/**
 * The one relation this console checks for its own access control: a
 * platform-wide "super admin" reuses Organization.admin against the
 * reserved "platform" organization id, rather than a new namespace/relation
 * — see platform/hooks/src/hooks_service/keto_client.py's
 * PLATFORM_ORGANIZATION_ID for the Python side that grants/revokes it.
 */
export async function isPlatformAdmin(identityId: string): Promise<boolean> {
  const allowed = await checkPermission({
    namespace: "Organization",
    object: "platform",
    relation: "admin",
    subject: identityId,
  });
  return allowed === true;
}

export async function listRelationTuples(
  namespace?: string,
  object?: string,
): Promise<RelationTuple[]> {
  const query = new URLSearchParams({ page_size: "200" });
  if (namespace) {
    query.set("namespace", namespace);
  }
  if (object) {
    query.set("object", object);
  }
  try {
    const response = await fetch(
      `${getEnv().ketoReadUrl}/relation-tuples?${query.toString()}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as {
      relation_tuples?: RelationTuple[];
    };
    return body.relation_tuples ?? [];
  } catch {
    return [];
  }
}

// Keto's read API requires a namespace per call (no cross-namespace
// query) — this loops KETO_NAMESPACES and aggregates, giving the identity
// detail page a real "everywhere this subject_id appears" view without a
// second index of its own.
export async function listRelationTuplesForSubject(
  subjectId: string,
): Promise<RelationTuple[]> {
  const results = await Promise.all(
    KETO_NAMESPACES.map(async (namespace) => {
      const query = new URLSearchParams({
        namespace, page_size: "200", subject_id: subjectId,
      });
      try {
        const response = await fetch(
          `${getEnv().ketoReadUrl}/relation-tuples?${query.toString()}`,
          { cache: "no-store" },
        );
        if (!response.ok) return [];
        const body = (await response.json()) as { relation_tuples?: RelationTuple[] };
        return body.relation_tuples ?? [];
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}

export async function checkPermission(
  query: CheckQuery,
): Promise<boolean | null> {
  try {
    const response = await fetch(
      `${getEnv().ketoReadUrl}/relation-tuples/check`,
      {
        body: JSON.stringify({
          namespace: query.namespace,
          object: query.object,
          relation: query.relation,
          subject_id: query.subject,
        }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    // Keto answers 403 for "denied"; both 200 and 403 carry `allowed`.
    if (!(response.ok || response.status === 403)) {
      return null;
    }
    const body = (await response.json()) as { allowed?: boolean };
    return body.allowed ?? null;
  } catch {
    return null;
  }
}

export function formatSubject(tuple: RelationTuple): string {
  if (tuple.subject_id) {
    return tuple.subject_id;
  }
  const set = tuple.subject_set;
  if (!set) {
    return "";
  }
  return `${set.namespace}:${set.object}#${set.relation}`;
}

// Moved to lib/identity-format.ts (pure, no server-only dependency) so
// Client Components can import them without pulling in this module's
// `import "server-only"` Admin API clients — re-exported here so every
// existing Server Component import site (app/console/page.tsx,
// app/console/clients/page.tsx, app/console/sessions/page.tsx,
// app/console/identities/[id]/page.tsx) keeps working unchanged.
export type { IdentityTraits } from "@/lib/identity-format";
export { displayName, formatDate, identityTraits } from "@/lib/identity-format";
