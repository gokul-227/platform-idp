/**
 * Email domain to Kratos OIDC provider id. A provider listed here is hidden from
 * the social button row, so a connection one tenant bought is not a sign-in option
 * for everyone. In code, which bounds it to what a deploy carries; moving it to
 * the platform API is a lookup in `ssoProviderForEmail` and nothing else.
 */
export const ENTERPRISE_SSO_PROVIDERS: Record<string, string> = {
  "acme.test": "acme-okta",
};

export const ENTERPRISE_PROVIDER_IDS = Object.values(ENTERPRISE_SSO_PROVIDERS);

export function ssoProviderForEmail(email: string): string | null {
  const domain = email.split("@").at(-1)?.toLowerCase() ?? "";
  return ENTERPRISE_SSO_PROVIDERS[domain] ?? null;
}
