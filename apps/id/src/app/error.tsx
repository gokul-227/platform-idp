"use client";

import { ErrorPage } from "@aec-craft/ui/components/blocks/error-page";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";

/**
 * Above every layout, so a failure replaces the whole window rather than
 * sitting inside the account or organization shell.
 *
 * A sign-in flow says what a settings page cannot: that nobody was signed in.
 * A person looking at a broken login page otherwise has no way to tell whether
 * it half-worked.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  const pathname = usePathname();
  const isAccount =
    pathname.startsWith("/account") || pathname.startsWith("/tenancy");

  useEffect(() => {
    console.error("[id] page failed", error);
  }, [error]);

  return (
    <ErrorPage
      action={
        <Button onClick={reset} size="sm" variant="outline">
          Try again
        </Button>
      }
      code={error.digest}
      hint={
        isAccount
          ? "Nothing has been changed. Check that the identity service is reachable, then try again."
          : "You have not been signed in. Check that the identity service is reachable, then try again."
      }
      title={
        isAccount
          ? "This page could not be loaded"
          : "This step could not be completed"
      }
    />
  );
}
