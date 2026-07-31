import type { ReactNode } from "react";

import { getSession } from "@/adapters/kratos-flow";
import { AuthShell } from "@/components/auth-shell";

/**
 * Where middleware.ts sends anyone who fails the /console/* admin check —
 * a real, friendly page instead of a bare "403" text response. Names no
 * Ory component (Kratos/Hydra/Keto/Oathkeeper) — a non-technical person
 * doesn't need to know what a "relation tuple" is to understand "ask an
 * administrator."
 */
export default async function UnauthorizedPage(): Promise<ReactNode> {
  const session = await getSession();
  const email = (session?.identity?.traits as { email?: string })?.email;

  return (
    <AuthShell title="This account is not an administrator">
      <p className="text-muted-foreground text-sm">
        {email ? (
          <>
            <span className="font-medium text-foreground">{email}</span> does not have
            administrator access to this platform.
          </>
        ) : (
          "This account does not have administrator access to this platform."
        )}
      </p>
      <p className="text-muted-foreground text-sm">
        Ask an existing administrator to grant you access from{" "}
        <span className="font-mono text-xs">Console → Settings → Administrators</span>.
      </p>
      <a className="text-sm underline" href="/auth">
        Back to home
      </a>
    </AuthShell>
  );
}
