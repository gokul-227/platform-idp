"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { type FormEvent, type ReactNode, useState } from "react";
import { ssoProviderForEmail } from "@/lib/sso";

/**
 * Domain-routed enterprise SSO: resolves the email domain to a Kratos OIDC
 * provider and posts it to the login flow like the social buttons do. The
 * email input carries no name, so only csrf_token + provider reach Kratos.
 */
export function SsoForm({
  action,
  csrfToken,
}: {
  action: string;
  csrfToken: string;
}): ReactNode {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const provider = ssoProviderForEmail(email);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (!provider) {
      event.preventDefault();
      setError("No SSO connection is configured for this domain.");
    }
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      method="POST"
      onSubmit={handleSubmit}
    >
      <input name="csrf_token" readOnly type="hidden" value={csrfToken} />
      <input name="provider" readOnly type="hidden" value={provider ?? ""} />
      <Input
        aria-label="Work email"
        autoComplete="email"
        autoFocus
        className="h-10 text-sm md:text-sm"
        onChange={(event) => {
          setEmail(event.target.value);
          setError(null);
        }}
        placeholder="you@company.com"
        required
        type="email"
        value={email}
      />
      <Button className="h-10 text-sm" type="submit">
        Continue with SSO
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
