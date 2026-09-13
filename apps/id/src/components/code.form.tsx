"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import type { UiText } from "@ory/client-fetch";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FlowMessages } from "./flow.form";
import { OtpField } from "./otp.field";

/** The emailed sign-in link's fragment; see the effect reading it below. */
const FRAGMENT_CODE = /^#code=(\d{6})$/;

/** A way back that is a link rather than a flow action: Kratos ships a `screen`
 *  button on registration and none on login, so login's own way out is a fresh
 *  flow at its start URL. */
export interface CodeRestart {
  href: string;
  label: string;
}

export interface CodeAction {
  label: string;
  name: string;
  value: string;
}

export interface CodeStep {
  action: string;
  back?: CodeAction | undefined;
  /** Address the code went to, for the description line. */
  email?: string | undefined;
  hiddenFields: { name: string; value: string }[];
  messages?: UiText[] | undefined;
  primary?: CodeAction | undefined;
  resend?: CodeAction | undefined;
}

/**
 * Code-entry step for any Kratos flow that uses the `code` method: login,
 * registration, recovery, verification. Posts natively to the flow action;
 * every field and button comes from the flow's ui nodes, so Kratos stays the
 * source of truth and CSRF is handled for us.
 */
export function CodeForm({
  action,
  email,
  hiddenFields,
  messages,
  primary,
  resend,
  back,
  title,
  description,
  autoSubmitFromFragment = false,
  restart,
}: CodeStep & {
  title: string;
  description?: string;
  /** Rendered when the flow itself offers no way back. */
  restart?: CodeRestart;
  /**
   * Honor an emailed sign-in link's `#code=` fragment by filling the field
   * and submitting. Only login mails carry such links; the other code flows
   * keep this off so a stray fragment can never spend one of their attempts.
   */
  autoSubmitFromFragment?: boolean;
}): ReactNode {
  // User lands here right after a code was sent; block immediate resends.
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitRef = useRef<HTMLButtonElement>(null);
  const [code, setCode] = useState("");
  const [isFromLink, setIsFromLink] = useState(false);

  // The emailed "sign in with one click" link carries the code in the URL
  // fragment, so it reaches this component without ever hitting a server log.
  // The fragment is dropped before submitting so reload/back cannot resubmit;
  // a stale code just re-renders this form with Kratos's usual error.
  useEffect(() => {
    if (!autoSubmitFromFragment) {
      return;
    }
    const match = FRAGMENT_CODE.exec(window.location.hash);
    if (!match?.[1]) {
      return;
    }
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
    setCode(match[1]);
    setIsFromLink(true);
  }, [autoSubmitFromFragment]);

  useEffect(() => {
    if (isFromLink && code.length === 6) {
      formRef.current?.requestSubmit(autoSubmitRef.current);
    }
  }, [isFromLink, code]);

  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-sm/relaxed">
          {description ?? "Enter the six-digit code we just sent"}
          {email ? (
            <>
              {" to "}
              <span className="text-foreground">{email}</span>
            </>
          ) : null}
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={action}
          className="flex flex-col gap-8"
          method="POST"
          ref={formRef}
        >
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
          <OtpField
            name="code"
            onChange={(value) => {
              setCode(value);
              setIsFromLink(false);
            }}
            value={code}
          />
          <div className="flex flex-col gap-2">
            {primary ? (
              // Native twin of the visible button below: requestSubmit needs a
              // submitter carrying method=code, and a plain element does that
              // without assuming the design-system Button forwards refs.
              <button
                hidden
                name={primary.name}
                ref={autoSubmitRef}
                type="submit"
                value={primary.value}
              />
            ) : null}
            {primary ? (
              <Button
                className="h-10 text-sm"
                name={primary.name}
                type="submit"
                value={primary.value}
              >
                {primary.label}
              </Button>
            ) : null}
            {resend ? (
              <Button
                className="h-10 text-sm"
                disabled={cooldown > 0}
                // The code input is `required`; without this the browser
                // blocks resend and back on an empty field.
                formNoValidate
                name={resend.name}
                type="submit"
                value={resend.value}
                variant="link"
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </Button>
            ) : null}
            {back ? (
              <Button
                className="h-10 text-sm"
                formNoValidate
                name={back.name}
                type="submit"
                value={back.value}
                variant="link"
              >
                {back.label}
              </Button>
            ) : null}
            {restart && !back ? (
              // A plain anchor, not a Button rendering one: the design system
              // sets role="button", which would take an anchor's link role
              // away. Not next/link either, because visiting the start URL
              // mints a flow, and a prefetch would mint one nobody asked for.
              <a
                className="inline-flex h-10 items-center justify-center text-primary text-sm underline-offset-4 hover:underline"
                href={restart.href}
              >
                {restart.label}
              </a>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
