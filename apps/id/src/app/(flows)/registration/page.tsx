import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { Input } from "@aec-craft/ui/components/primitives/input";
import Link from "next/link";
import type { ReactNode } from "react";
import { CodeForm } from "@/components/code.form";
import {
  csrfTokenFromUi,
  FlowMessages,
  fieldFromUi,
} from "@/components/flow.form";
import { AuthDivider, SocialButtons } from "@/components/social.buttons";
import { codeStepFromUi } from "@/lib/code.step";
import { type FlowSearchParams, getBrowserFlow } from "@/lib/kratos";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const flow = await getBrowserFlow("registration", params);

  const step = codeStepFromUi(flow.ui);
  if (step) {
    return <CodeForm {...step} title="Confirm your email" />;
  }

  const csrfToken = csrfTokenFromUi(flow.ui);
  const email = fieldFromUi(flow.ui, "traits.email");
  const first = fieldFromUi(flow.ui, "traits.name.first");
  const last = fieldFromUi(flow.ui, "traits.name.last");

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">Create account</CardTitle>
        <CardDescription className="text-sm/relaxed">
          Already have one?{" "}
          <Link className="text-foreground underline" href="/login">
            Sign in
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <FlowMessages
            messages={[
              ...(flow.ui.messages ?? []),
              ...email.messages,
              ...first.messages,
              ...last.messages,
            ]}
          />

          {/* Posts `method=code` straight from this screen. Kratos's own
              button posts `method=profile`, which inserts a second
              "choose a credential" screen offering the same options again. */}
          <form
            action={flow.ui.action}
            className="flex flex-col gap-3"
            method="POST"
          >
            <input name="csrf_token" readOnly type="hidden" value={csrfToken} />
            <Input
              aria-invalid={email.messages.length > 0}
              aria-label="Email"
              autoComplete="email"
              autoFocus
              className="h-10 text-sm md:text-sm"
              defaultValue={email.defaultValue}
              name="traits.email"
              placeholder="you@company.com"
              required
              type="email"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                aria-invalid={first.messages.length > 0}
                aria-label="First name"
                autoComplete="given-name"
                className="h-10 text-sm md:text-sm"
                defaultValue={first.defaultValue}
                name="traits.name.first"
                placeholder="First name"
              />
              <Input
                aria-invalid={last.messages.length > 0}
                aria-label="Last name"
                autoComplete="family-name"
                className="h-10 text-sm md:text-sm"
                defaultValue={last.defaultValue}
                name="traits.name.last"
                placeholder="Last name"
              />
            </div>
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
        </div>
      </CardContent>
    </Card>
  );
}
