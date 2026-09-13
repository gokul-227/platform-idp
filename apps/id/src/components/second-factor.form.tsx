"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { Input } from "@aec-craft/ui/components/primitives/input";
import type { UiText } from "@ory/client-fetch";
import { type ReactNode, useState } from "react";
import { FlowMessages } from "./flow.form";
import { OtpField } from "./otp.field";

export interface SecondFactorMethod {
  /** Input name Kratos expects for this method's code. */
  field: string;
  submit: { name: string; value: string };
}

export interface SecondFactorStep {
  action: string;
  hiddenFields: { name: string; value: string }[];
  lookupSecret?: SecondFactorMethod | undefined;
  messages?: UiText[] | undefined;
  totp?: SecondFactorMethod | undefined;
}

/**
 * Second factor for a login flow whose requested AAL the session has not
 * reached. One method is on screen at a time: offering both at once invites
 * submitting the wrong field, and Kratos answers that with a bare validation
 * error rather than anything a user can act on.
 */
export function SecondFactorForm({
  action,
  hiddenFields,
  lookupSecret,
  messages,
  totp,
}: SecondFactorStep): ReactNode {
  const [useBackupCode, setUseBackupCode] = useState(!totp);
  const method = useBackupCode ? lookupSecret : totp;

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
        <CardDescription className="text-sm/relaxed">
          {useBackupCode
            ? "Enter one of the backup codes you saved when you set this up."
            : "Enter the six-digit code from your authenticator app."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-8" method="POST">
          <FlowMessages messages={messages} />
          {hiddenFields.map((field) => (
            <input
              key={field.name}
              name={field.name}
              readOnly
              type="hidden"
              value={field.value}
            />
          ))}

          {method && useBackupCode ? (
            <Input
              aria-label="Backup code"
              autoComplete="one-time-code"
              autoFocus
              className="h-10 text-center text-sm md:text-sm"
              name={method.field}
              required
              spellCheck={false}
            />
          ) : null}
          {method && !useBackupCode ? <OtpField name={method.field} /> : null}

          <div className="flex flex-col gap-2">
            {method ? (
              <Button
                className="h-10 text-sm"
                name={method.submit.name}
                type="submit"
                value={method.submit.value}
              >
                Continue
              </Button>
            ) : null}
            {totp && lookupSecret ? (
              <Button
                className="h-10 text-sm"
                onClick={() => setUseBackupCode((value) => !value)}
                type="button"
                variant="ghost"
              >
                {useBackupCode
                  ? "Use your authenticator app"
                  : "Use a backup code"}
              </Button>
            ) : null}
          </div>

          {/* The only way out: with a session at a lower AAL than the one
              required, Kratos re-serves this challenge for any other flow. */}
          <CardDescription className="text-center text-sm/relaxed">
            {/* Plain anchor: /logout is a route handler with a side effect. */}
            <a className="text-foreground underline" href="/logout">
              Use a different account
            </a>
          </CardDescription>
        </form>
      </CardContent>
    </Card>
  );
}
