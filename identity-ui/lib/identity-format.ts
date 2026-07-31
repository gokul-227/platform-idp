// Pure, client-safe identity-formatting helpers — deliberately split out of
// adapters/admin.ts, which starts with `import "server-only"` (it
// instantiates the real Kratos/Hydra Admin API clients at module scope).
// These 3 functions have no such dependency, but living in that file meant
// any Client Component importing them pulled in the whole server-only
// module too — confirmed live: a real Next.js build error ("You're
// importing a component that needs 'server-only'... into a Client
// Component") when app/console/identities/identities-table.tsx imported
// them from adapters/admin.ts directly. adapters/admin.ts re-exports these
// so every existing Server Component import site is unaffected.

export interface IdentityTraits {
  email?: string;
  name?: { first?: string; last?: string };
}

export function identityTraits(identity: { traits?: unknown }): IdentityTraits {
  return (identity.traits ?? {}) as IdentityTraits;
}

export function displayName(identity: { id: string; traits?: unknown }): string {
  const traits = identityTraits(identity);
  return (
    [traits.name?.first, traits.name?.last].filter(Boolean).join(" ") ||
    traits.email ||
    identity.id
  );
}

export function formatDate(value?: Date): string {
  if (!value) {
    return "";
  }
  return value.toISOString().replace("T", " ").slice(0, 16);
}
