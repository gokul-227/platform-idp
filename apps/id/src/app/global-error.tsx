"use client";

import { ErrorPage } from "@aec-craft/ui/components/blocks/error-page";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { fontVariables } from "@aec-craft/ui/fonts";
import { type ReactNode, useEffect } from "react";

import "./globals.css";

/**
 * The last boundary. It replaces the root layout, so it renders its own
 * document and reaches for no app chrome, which is the thing that has failed by
 * the time this shows.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  useEffect(() => {
    console.error("[global] the root layout failed", error);
  }, [error]);

  return (
    <html className={fontVariables} lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ErrorPage
          action={
            <Button onClick={reset} size="sm" variant="outline">
              Try again
            </Button>
          }
          code={error.digest}
          hint="The application failed before it could render. If this persists, the digest above identifies it in the server logs."
          title="Something went wrong"
        />
      </body>
    </html>
  );
}
