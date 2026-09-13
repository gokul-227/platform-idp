import {
  Button,
  buttonVariants,
} from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { ArrowRightIcon } from "@aec-craft/ui/icons";
import { cn } from "@aec-craft/ui/lib/utils";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CodeForm } from "@/components/code.form";
import {
  csrfTokenFromUi,
  FlowMessages,
  fieldFromUi,
} from "@/components/flow.form";
import { SecondFactorEnrolment } from "@/components/second-factor.enrolment";
import { SecondFactorForm } from "@/components/second-factor.form";
import { AuthDivider, SocialButtons } from "@/components/social.buttons";
import { codeStepFromUi } from "@/lib/code.step";
import { type FlowSearchParams, getBrowserFlow } from "@/lib/kratos";
import { healedAddress, restartAddress } from "@/lib/login.address";
import { safeReturnTo } from "@/lib/safe-return-to";
import {
  isSecondFactorRequired,
  secondFactorStepFromUi,
} from "@/lib/second-factor.step";

/**
 * This flow's URL, sent as transient payload so the code email can offer a
 * one-click link. `host`, not `x-forwarded-host`, because the load balancer
 * preserves the original and nothing sets the forwarded variant; an unexpected
 * Host fails the courier allowlist, which costs the button and never safety.
 *
 * `?flow=` and nothing else: the value is browser-submitted, so a
 * `login_challenge` here would mail somebody a real sign-in link bound to an
 * authorize request the sender chose (tests/courier.link.test.ts).
 */
async function transientPayload(flowId: string): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  return JSON.stringify({
    flow_url: `${proto}://${host}/login?flow=${flowId}`,
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const flow = await getBrowserFlow("login", params);

  // Before anything else reads the flow, so every screen and every replacement
  // inherits it. A browser reapplies the fragment across a redirect whose target
  // has none, so the one-click link's code survives this hop.
  const healed = healedAddress(flow, params);
  if (healed) {
    redirect(healed);
  }

  // Before the code step: an AAL2 flow carries a session already, so the
  // first-factor screen below would be asking a signed-in operator to sign in.
  const secondFactor = secondFactorStepFromUi(flow.ui);
  if (secondFactor) {
    return <SecondFactorForm {...secondFactor} />;
  }
  // A step-up flow with no method on it: the identity has no second factor, so
  // the only screen that can move this forward is enrolment. Falling through
  // would offer a first-factor form Kratos refuses on an AAL2 flow.
  if (isSecondFactorRequired(flow)) {
    return <SecondFactorEnrolment returnTo={safeReturnTo(flow.return_to)} />;
  }

  const payload = await transientPayload(flow.id);

  const step = codeStepFromUi(flow.ui);
  if (step) {
    // Present on the resend submit too, so resent codes keep their link.
    step.hiddenFields.push({ name: "transient_payload", value: payload });
    return (
      <CodeForm
        {...step}
        autoSubmitFromFragment
        restart={{
          href: restartAddress(flow),
          label: "Use a different account",
        }}
        title="Enter your code"
      />
    );
  }

  const csrfToken = csrfTokenFromUi(flow.ui);
  const email = fieldFromUi(flow.ui, "identifier");

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">Sign in</CardTitle>
        <CardDescription className="text-sm/relaxed">
          No account yet?{" "}
          <Link className="text-foreground underline" href="/registration">
            Register now
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <FlowMessages
            messages={[...(flow.ui.messages ?? []), ...email.messages]}
          />

          <form
            action={flow.ui.action}
            className="flex flex-col gap-3"
            method="POST"
          >
            <input name="csrf_token" readOnly type="hidden" value={csrfToken} />
            <input
              name="transient_payload"
              readOnly
              type="hidden"
              value={payload}
            />
            <Input
              aria-invalid={email.messages.length > 0}
              aria-label="Email"
              autoComplete="email"
              autoFocus
              className="h-10 text-sm md:text-sm"
              defaultValue={email.defaultValue}
              name="identifier"
              placeholder="you@company.com"
              required
              type="email"
            />
            <Button
              className="h-10 text-sm"
              name="method"
              type="submit"
              value="code"
            >
              Continue with email
            </Button>
          </form>

          <AuthDivider />

          <SocialButtons ui={flow.ui} />

          {/* Disabled until the first real connection is provisioned; the
              screen behind it (/login/sso) still works. */}
          <span
            aria-disabled="true"
            className={cn(
              buttonVariants({ size: "sm", variant: "link" }),
              "pointer-events-none self-center opacity-40"
            )}
          >
            Use your company SSO
            <ArrowRightIcon data-icon="inline-end" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
