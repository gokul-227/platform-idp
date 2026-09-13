"use client";

import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@aec-craft/ui/components/primitives/radio-group";
import Link from "next/link";
import { type ReactNode, useActionState } from "react";
import { CopyButton } from "@/components/copy.button";
import { type CreateApplicationResult, createApplication } from "../actions";
import {
  type ApplicationDefaults,
  ApplicationFields,
} from "../application.fields";

const CLIENT_TYPES = [
  {
    description: "Server-side apps and APIs that can keep a secret.",
    label: "Confidential",
    value: "confidential",
  },
  {
    description: "Browser, desktop, mobile and MCP clients. Bound with PKCE.",
    label: "Public",
    value: "public",
  },
] as const;

/** What a new application starts with: browser sign-in for a human user. */
const DEFAULTS: ApplicationDefaults = {
  audience: [],
  grantTypes: ["authorization_code", "refresh_token"],
  postLogoutRedirectUris: [],
  redirectUris: [],
  scope: "openid offline_access email",
  skipConsent: false,
};

function SecretReveal({
  result,
}: {
  result: CreateApplicationResult;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
      <p className="text-sm">
        Client created. The secret is shown once; store it now.
      </p>
      <div className="grid grid-cols-[max-content_1fr_max-content] items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-muted-foreground">client_id</span>
        <code className="truncate font-mono text-xs">{result.clientId}</code>
        <CopyButton value={result.clientId ?? ""} />
        {result.clientSecret ? (
          <>
            <span className="text-muted-foreground">client_secret</span>
            <code className="truncate font-mono text-xs">
              {result.clientSecret}
            </code>
            <CopyButton value={result.clientSecret} />
          </>
        ) : null}
      </div>
      {result.clientSecret ? null : (
        <p className="text-muted-foreground text-xs">
          Public client; no secret. Token requests are bound by PKCE.
        </p>
      )}
      <Link
        className="text-sm underline"
        href={`/applications/${result.clientId}`}
      >
        View client
      </Link>
    </div>
  );
}

export function ApplicationCreateForm(): ReactNode {
  const [result, formAction, isPending] = useActionState<
    CreateApplicationResult,
    FormData
  >(createApplication, {});

  if (result.clientId) {
    return <SecretReveal result={result} />;
  }

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" required />
        </Field>

        <FieldSet>
          <FieldLegend>Type</FieldLegend>
          <RadioGroup defaultValue="confidential" name="type">
            {CLIENT_TYPES.map((type) => (
              <Field key={type.value} orientation="horizontal">
                <RadioGroupItem id={`type-${type.value}`} value={type.value} />
                <FieldContent>
                  <FieldLabel htmlFor={`type-${type.value}`}>
                    {type.label}
                  </FieldLabel>
                  <FieldDescription>{type.description}</FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>

        <ApplicationFields defaults={DEFAULTS} />

        <Field>
          <FieldLabel htmlFor="owner">Owner</FieldLabel>
          <Input id="owner" name="owner" placeholder="org id (optional)" />
          <FieldDescription>
            Org that owns this client. Empty means platform-level; org-side
            self-service lists and manages only its own clients.
          </FieldDescription>
        </Field>

        {result.error ? (
          <p className="text-destructive text-sm">{result.error}</p>
        ) : null}
        <Field orientation="horizontal">
          <Button disabled={isPending} type="submit">
            {isPending ? <Spinner className="size-4" /> : "Create client"}
          </Button>
          <Link
            className="text-muted-foreground text-sm hover:underline"
            href="/applications"
          >
            Cancel
          </Link>
        </Field>
      </FieldGroup>
    </form>
  );
}
