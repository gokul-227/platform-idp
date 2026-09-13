import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { cn } from "@aec-craft/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The other half of a step-up flow: Kratos serves an AAL2 flow to an identity with
 * nothing enrolled, carrying no method, so enrolment is the only way forward and
 * the login page's first-factor form cannot advance it.
 *
 * `/account` is reachable because the settings flow requires `highest_available`,
 * which for such an identity is AAL1; pinned to `aal2` it would loop back here.
 */
export function SecondFactorEnrolment({
  returnTo,
}: {
  returnTo?: string | null;
}): ReactNode {
  const href = returnTo
    ? `/account?return_to=${encodeURIComponent(returnTo)}`
    : "/account";

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">
          Two-factor authentication required
        </CardTitle>
        <CardDescription className="text-sm/relaxed">
          This application asks for a second factor, and your account does not
          have one yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Link className={cn(buttonVariants(), "h-10 text-sm")} href={href}>
          Set up an authenticator app
        </Link>
        <CardDescription className="text-center text-sm/relaxed">
          {/* Plain anchor: /logout is a route handler with a side effect. */}
          <a className="text-foreground underline" href="/logout">
            Use a different account
          </a>
        </CardDescription>
      </CardContent>
    </Card>
  );
}
