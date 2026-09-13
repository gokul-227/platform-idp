import { env } from "./env";
import { getSession } from "./kratos";

/**
 * The platform's profile row for an identity, removed when the identity is.
 * Kratos hooks keep it current, but deletion has no hook to hang on: there is no
 * self-service deletion flow and the admin API fires nothing, so whoever made
 * the call is the only thing that knows. The console carries the same module.
 */

/**
 * Give the platform the row that `/me` and every `created_by` reference. Runs here
 * rather than only from a Kratos hook, because the hook's bearer value is a secret
 * and that config is baked into the image; consent already holds the identity, the
 * URL and the secret.
 *
 * Never fatal: a slow platform must not stop a sign-in, and the next one retries.
 * A late profile is what the platform words as "Account not ready".
 */
export async function ensurePlatformProfile(subject: string): Promise<void> {
  if (!(env.platformApiUrl && env.identityWebhookSecret && subject)) {
    return;
  }

  const identity = (await getSession())?.identity;
  // Checked rather than assumed, for the reason the claims module gives: a
  // session belonging to somebody else would provision one person's row from
  // another person's grant.
  if (identity?.id !== subject) {
    return;
  }

  const traits = (identity.traits ?? {}) as {
    email?: string;
    name?: { first?: string; last?: string };
  };
  if (!traits.email) {
    return;
  }
  const name = [traits.name?.first, traits.name?.last]
    .filter(Boolean)
    .join(" ");

  try {
    const response = await fetch(`${env.platformApiUrl}/webhooks/identity`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.identityWebhookSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        externalId: subject,
        email: traits.email,
        ...(name ? { name } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(
        `[id/platform.profile] profile upsert refused with HTTP ${response.status}`
      );
    }
  } catch (error) {
    console.warn(
      `[id/platform.profile] profile upsert failed: ${reasonOf(error)}`
    );
  }
}

/** An authority the platform will not leave without an owner. */
export interface BlockingAuthority {
  id: string;
  name: string;
}

export type ProfileRemoval =
  | { type: "removed" }
  | { type: "no-consumer" }
  | { type: "blocked"; authorities: BlockingAuthority[] }
  | { type: "failed"; reason: string };

const TIMEOUT_MS = 5000;

/**
 * Ask the platform to drop the profile.
 *
 * Idempotent on its end: an identity it has never heard of answers 204, so a
 * retry after a half-finished deletion is safe and so is deleting someone who
 * never signed in.
 */
export async function removePlatformProfile(
  externalId: string
): Promise<ProfileRemoval> {
  if (!(env.platformApiUrl && env.identityWebhookSecret)) {
    return { type: "no-consumer" };
  }

  let response: Response;
  try {
    response = await fetch(
      `${env.platformApiUrl}/webhooks/identity/${encodeURIComponent(externalId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${env.identityWebhookSecret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      }
    );
  } catch (error) {
    return { type: "failed", reason: reasonOf(error) };
  }

  if (response.ok) {
    return { type: "removed" };
  }
  if (response.status === 409) {
    return {
      type: "blocked",
      authorities: await blockingAuthorities(response),
    };
  }
  return { type: "failed", reason: `HTTP ${response.status}` };
}

/**
 * The authorities named in a 409, or an empty list.
 *
 * The refusal stands either way: a body that cannot be read costs the operator
 * the list of what to hand over, not the protection itself.
 */
async function blockingAuthorities(
  response: Response
): Promise<BlockingAuthority[]> {
  try {
    const body = (await response.json()) as {
      error?: { details?: { authorities?: unknown } };
    };
    const authorities = body.error?.details?.authorities;
    if (!Array.isArray(authorities)) {
      return [];
    }
    return authorities.filter(
      (entry): entry is BlockingAuthority =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as BlockingAuthority).id === "string" &&
        typeof (entry as BlockingAuthority).name === "string"
    );
  } catch {
    return [];
  }
}

function reasonOf(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `no answer within ${TIMEOUT_MS}ms`;
  }
  return error instanceof Error ? error.message : "unreachable";
}
