"use client";

import { ErrorCard } from "@aec-craft/ui/components/blocks/error-page";
import { Button } from "@aec-craft/ui/components/primitives/button";
import type { ReactNode } from "react";

/** A read that failed, in place of what it would have shown. */
export function QueryError({
  error,
  onRetry,
  subject,
}: {
  error: unknown;
  onRetry: () => void;
  /** Completes "could not read …". */
  subject: string;
}): ReactNode {
  return (
    <ErrorCard
      action={
        <Button onClick={onRetry} size="sm" variant="outline">
          Try again
        </Button>
      }
      message={error instanceof Error ? error.message : undefined}
      title={`Could not read ${subject}`}
    />
  );
}
