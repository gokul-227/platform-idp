import { RefusalErrors } from "@aec-craft/platform-id-contracts/console/refusal.errors";
import {
  type Authority,
  authorityOf,
} from "@aec-craft/platform-id-sdk/identity";
import type { Identity } from "@ory/client-fetch";
import { configuredRoots } from "./roots";
import { getSession } from "./session";

/**
 * Console access and the one rule protecting it. Server-only. Granting moves an
 * identity onto the `staff` schema and writes a role into `metadata_public`;
 * revoking moves it back, always the same identity, because Kratos keeps sign-in
 * identifiers unique across schemas and refuses a second one with a 409.
 */

/** Second factors, which the console requires; `code` is the first factor. */
const SECOND_FACTORS = ["totp", "lookup_secret"];

/**
 * Whether this operator can reach aal2 at all. Worth surfacing: the gate needs
 * aal2, so an operator without a second factor is refused at the door, and the
 * reason is invisible from their role or their state.
 */
export function hasSecondFactor(identity: Identity): boolean {
  const credentials = identity.credentials ?? {};
  return SECOND_FACTORS.some((type) => credentials[type]);
}

export interface Actor {
  /** Never `staff`: `getActor` admits only the two authorities that may act. */
  authority: Extract<Authority, "admin" | "root">;
  id: string;
  identity: Identity;
}

/**
 * Who is making the change, from the session, which is the one thing a caller
 * cannot choose. Staff holding no role reach the console's door and nothing
 * behind it, so this admits only the two authorities that may act.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  const identity = session?.identity;
  if (!identity) {
    return null;
  }
  const authority = authorityOf(identity, configuredRoots());
  if (!(authority === "root" || authority === "admin")) {
    return null;
  }
  return { authority, id: identity.id, identity };
}

/**
 * The one rule: every admin may administer every account, but who the admins
 * are is a root's to decide, in both directions. A root is one of them: the
 * platform reads `schema` and `staffRole` off the token and knows nothing of
 * `ROOT_EMAILS`, so a root holds `admin` in the identity like anyone who
 * administers, and may write it there. `next` null revokes.
 */
export function assertAccessChange(
  actor: Actor | null,
  target: Identity,
  next: Authority | null
): void {
  if (!actor) {
    throw new Error(RefusalErrors["not-signed-in"].description);
  }
  const authority = authorityOf(target, configuredRoots());
  if (
    actor.authority !== "root" &&
    (next === "admin" || authority === "admin")
  ) {
    throw new Error(RefusalErrors["needs-root"].description);
  }
}
