import { commaList } from "@aec-craft/platform-id-contracts/identity/email";

/**
 * The addresses that administer everything and may appoint admins. Read from the
 * environment on every call rather than cached, so removing somebody takes effect
 * on the next request and never waits for a grant to expire.
 *
 * Throws when unset, because the quiet failure is the dangerous one: with no roots
 * the console admits nobody to the access rules, nobody can appoint an admin, and
 * every page renders as though that were the policy. A 500 naming the variable is
 * the smaller problem.
 */
export function configuredRoots(): string[] {
  const roots = commaList(process.env.ROOT_EMAILS);
  if (roots.length === 0) {
    throw new Error(
      "console: ROOT_EMAILS must name at least one address. A deployment with none has nobody able to appoint an admin, and no way back in."
    );
  }
  return roots;
}
