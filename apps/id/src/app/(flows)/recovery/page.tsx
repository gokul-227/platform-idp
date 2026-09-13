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
import { codeStepFromUi } from "@/lib/code.step";
import { type FlowSearchParams, getBrowserFlow } from "@/lib/kratos";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const flow = await getBrowserFlow("recovery", params);

  const step = codeStepFromUi(flow.ui);
  if (step) {
    return <CodeForm {...step} title="Enter your recovery code" />;
  }

  const csrfToken = csrfTokenFromUi(flow.ui);
  const email = fieldFromUi(flow.ui, "email");

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">Recover access</CardTitle>
        <CardDescription className="text-sm/relaxed">
          We&apos;ll email you a code to get back into your account.
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
            <Input
              aria-invalid={email.messages.length > 0}
              aria-label="Email"
              autoComplete="email"
              autoFocus
              className="h-10 text-sm md:text-sm"
              defaultValue={email.defaultValue}
              name="email"
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
              Send recovery code
            </Button>
          </form>

          <Link
            className="self-center text-muted-foreground text-sm underline"
            href="/login"
          >
            Back to sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
