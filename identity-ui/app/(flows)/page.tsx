import type { ReactNode } from "react";

import { isPlatformAdmin } from "@/adapters/admin";
import { hasAnyPlatformAdmin } from "@/adapters/hooks-service";
import { getSession } from "@/adapters/kratos-flow";
import {
  Button,
} from "@/components/vendor/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/vendor/ui/card";
import { loadTheme } from "@/themes/load-theme";

// Matches .reference/platform-ory-id-spike/apps/id/src/app/(flows)/page.tsx
// exactly: one Card, no redirect. Signed-out shows Sign in/Create account;
// signed-in shows who you are + Account settings/Sign out. This replaces
// the previous version's blind `redirect("/login")` — that hid the actual
// landing experience the reference always shows.

export default async function RootPage(): Promise<ReactNode> {
  const session = await getSession();
  const theme = loadTheme();
  const traits = session?.identity?.traits as { email?: string } | undefined;
  const identityId = session?.identity?.id;
  const [isAdmin, anyAdminExists] = identityId
    ? await Promise.all([isPlatformAdmin(identityId), hasAnyPlatformAdmin()])
    : [false, true];

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">{theme.productName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {session ? (
          <>
            <p className="text-muted-foreground text-sm">
              Signed in as{" "}
              <span className="text-foreground">{traits?.email}</span>
            </p>
            <div className="flex flex-col gap-2">
              {isAdmin ? (
                <a href="/auth/console">
                  <Button className="w-full">Admin Console</Button>
                </a>
              ) : !anyAdminExists ? (
                <a href="/auth/setup">
                  <Button className="w-full">Set up this platform</Button>
                </a>
              ) : (
                <p className="text-muted-foreground text-xs">
                  This account is not an administrator. Ask an existing administrator to grant
                  access from Console → Settings → Administrators.
                </p>
              )}
              <a href="/auth/settings">
                <Button className="w-full" variant="outline">
                  Account settings
                </Button>
              </a>
              <a href="/auth/logout">
                <Button className="w-full" variant="outline">
                  Sign out
                </Button>
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <a href="/auth/login">
              <Button className="w-full">Sign in</Button>
            </a>
            <a href="/auth/registration">
              <Button className="w-full" variant="outline">
                Create account
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
