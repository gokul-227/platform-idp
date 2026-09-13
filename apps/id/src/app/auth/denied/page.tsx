import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Where the OIDC callback sends somebody whose authorization did not complete.
 *
 * It has to sit outside anything that would start a fresh authorization, or the
 * redirect loops them back into the step that just failed — which is why the
 * package takes this path as an option rather than reusing the login route.
 *
 * The issuer's reason is not rendered. `access_denied` means a person declined,
 * and anything else is a configuration fault whose wording names internal hosts;
 * neither is something the visitor can act on beyond trying again.
 */
export default function Page(): ReactNode {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <Card className="gap-8">
        <CardHeader>
          <CardTitle className="text-base">
            Organization access was not granted
          </CardTitle>
          <CardDescription className="text-sm/relaxed">
            Managing an organization needs your permission for this app to read
            it on your behalf. Nothing about your account has changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link href="/tenancy" />}>Try again</Button>
          <Link
            className="self-start text-muted-foreground text-sm underline"
            href="/account"
          >
            Back to account
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
