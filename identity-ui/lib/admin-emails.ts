import "server-only";

// Backs app/api/admin-email-check/route.ts — a UI EMPHASIS signal only
// (which login methods components/login-flow.tsx highlights for a given
// email after "Continue"). Reads a plain comma-separated env var; never
// grants or restricts real authentication/authorization, Kratos itself
// remains the sole source of truth for that. Deliberately not a component-
// level hardcode so an operator can change the list (deployment/docker/
// compose/docker-compose.dev.yml's identity-ui service, or ADMIN_EMAILS in
// .env) without a code change.
function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return parseAdminEmails(process.env.ADMIN_EMAILS).has(normalized);
}
