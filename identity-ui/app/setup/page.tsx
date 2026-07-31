import type { ReactNode } from "react";

import { hasAnyPlatformAdmin } from "@/adapters/hooks-service";
import { getSession } from "@/adapters/kratos-flow";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/vendor/ui/button";

/**
 * First-run admin bootstrap — the one browser-only path to become platform
 * admin with zero curl/Postman/manual Keto tuples/manual SQL. Reachable at
 * any time, but only does anything while the platform has zero admins:
 * hooks-service's /admin/bootstrap self-disables permanently the moment any
 * admin exists, so this page becomes a dead end (by design) after the
 * first claim — see platform/hooks/src/hooks_service/main.py.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ already_configured?: string; error?: string }>;
}): Promise<ReactNode> {
  const [{ already_configured: alreadyConfigured, error }, hasAdmin, session] = await Promise.all(
    [searchParams, hasAnyPlatformAdmin(), getSession()],
  );

  if (hasAdmin || alreadyConfigured) {
    return (
      <AuthShell title="Platform already configured">
        <p className="text-muted-foreground text-sm">
          An administrator has already been set up for this platform. If you need admin access,
          ask your existing administrator to grant it from{" "}
          <span className="font-mono text-xs">/console/identities</span>.
        </p>
        <a className="text-sm underline" href="/auth">
          Back to sign in
        </a>
      </AuthShell>
    );
  }

  if (!session?.identity) {
    return (
      <AuthShell title="Set up your platform">
        <p className="text-muted-foreground text-sm">
          No administrator has been configured yet. Register or sign in first — whoever completes
          this setup step next becomes the first administrator.
        </p>
        <div className="flex gap-4 text-sm">
          <a className="underline" href="/auth/registration?return_to=%2Fauth%2Fsetup">
            Create an account
          </a>
          <a className="underline" href="/auth/login?return_to=%2Fauth%2Fsetup">
            Sign in
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set up your platform">
      <p className="text-muted-foreground text-sm">
        No administrator has been configured yet. You are signed in as{" "}
        <span className="font-medium text-foreground">{session.identity.traits?.email}</span>.
        Claim administrator access to manage identities, organizations, applications, and every
        other console page.
      </p>
      {error ? (
        <p className="text-destructive text-sm">Could not complete setup: {error}</p>
      ) : null}
      <form action="/auth/setup/claim" method="POST">
        <Button type="submit">Make me the administrator</Button>
      </form>
    </AuthShell>
  );
}
