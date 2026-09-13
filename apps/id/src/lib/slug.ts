/**
 * Deriving a URL-safe handle from a display name.
 *
 * Not in the organizations server action that uses it: a `"use server"` module
 * may only export async functions, so a synchronous helper there fails the build
 * — and the create dialog is a client component that needs the same derivation
 * to show the handle before it is submitted. One implementation, importable from
 * both sides, is what keeps the preview and the stored value the same.
 *
 * Deliberately the same shape platform's own fallback produces, so a handle
 * shown here is the handle that gets stored. Collisions stay platform's: it
 * appends a numeric suffix rather than refusing.
 */

const SLUG_MAX = 64;
const NON_SLUG = /[^a-z0-9-]+/g;
const EDGE_DASHES = /^-+|-+$/g;

export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(NON_SLUG, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, SLUG_MAX);
}
