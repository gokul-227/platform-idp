"use client";

import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { type ReactNode, useActionState } from "react";
import { CopyButton } from "@/components/copy.button";
import { createRecoveryLink, type RecoveryLinkResult } from "../actions";

/**
 * Mints a magic recovery link via the admin API: the operator hand-off for
 * console-created identities (no password exists yet).
 */
export function RecoveryForm({
  identityId,
}: {
  identityId: string;
}): ReactNode {
  const [result, formAction, isPending] = useActionState<
    RecoveryLinkResult,
    FormData
  >(createRecoveryLink, {});

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input defaultValue={identityId} name="id" type="hidden" />
        <Button disabled={isPending} type="submit" variant="outline">
          {isPending ? (
            <Spinner className="size-4" />
          ) : (
            "Generate recovery link"
          )}
        </Button>
      </form>
      {result.link ? (
        <div className="flex items-center gap-2 rounded-md bg-muted p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {result.link}
          </code>
          <CopyButton value={result.link} />
        </div>
      ) : null}
      {result.code ? (
        <p className="text-muted-foreground text-xs">
          Recovery code:{" "}
          <code className="font-mono text-foreground">{result.code}</code>
        </p>
      ) : null}
      {result.expiresAt ? (
        <p className="text-muted-foreground text-xs">
          Single use; expires {result.expiresAt.replace("T", " ").slice(0, 16)}.
        </p>
      ) : null}
    </div>
  );
}
