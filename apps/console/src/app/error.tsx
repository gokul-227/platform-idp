"use client";

import { ErrorPage } from "@aec-craft/ui/components/blocks/error-page";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";

/**
 * Above every layout, so a failure replaces the whole window rather than
 * sitting inside the console's chrome. A boundary under the sidebar rendered a
 * fault card beside a nav offering every other page, which reads as a page that
 * lost its content instead of as the console being unable to answer.
 *
 * The audit log gets its own sentence, because it is the one page where an
 * empty result and a failed read look identical and "no events" would be worse
 * than saying it is broken.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  const pathname = usePathname();
  const isAudit = pathname.startsWith("/audit");

  useEffect(() => {
    console.error("[console] page failed", error);
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
        isAudit
          ? "This is a fault, not an empty log. Check that the audit database is reachable and that its migrations have been applied."
          : "Nothing has been changed. Check that the service behind this page is reachable; the code above identifies this failure in the server logs."
      }
      title={
        isAudit
          ? "The audit log could not be read"
          : "This page could not be read"
      }
    />
  );
}
