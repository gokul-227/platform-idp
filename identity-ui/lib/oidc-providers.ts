// Kratos's oidc method (ory/kratos/config/kratos.yaml.tmpl) now configures
// ONLY these 2 providers — github/apple/gitlab were removed from the
// backend config entirely in a later pass (their provider blocks and
// mapper .jsonnet files deleted), not just UI-hidden. This allow-list is
// now a defense-in-depth belt-and-suspenders check, not the only thing
// standing between a user and a 3rd-party button: even if a stray oidc
// node from some other provider ever appeared in a Kratos response (it
// can't today), this filter would still exclude it. Kept for that reason,
// not because backend removal alone was considered sufficient.
export const ALLOWED_OIDC_PROVIDERS = ["google", "microsoft"] as const;

export function isAllowedOidcProvider(provider: string): boolean {
  return (ALLOWED_OIDC_PROVIDERS as readonly string[]).includes(provider);
}
