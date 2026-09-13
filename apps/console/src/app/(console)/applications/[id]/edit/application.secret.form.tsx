"use client";

import { type ReactNode, useState } from "react";
import { ConfirmButton } from "@/components/confirm.button";
import { CopyButton } from "@/components/copy.button";
import {
  type RotateSecretResult,
  rotateApplicationSecret,
} from "../../actions";

/**
 * Rotation, with the same one-time reveal creation uses, because it is the same
 * fact: the response carries the secret and nothing can retrieve it afterwards.
 */
export function ApplicationSecretForm({
  clientId,
}: {
  clientId: string;
}): ReactNode {
  const [result, setResult] = useState<RotateSecretResult>({});

  if (result.clientSecret) {
    return (
      <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
        <p className="text-sm">
          New secret, shown once; store it now. The previous one no longer
          authenticates, so deploy this before the application signs anyone in
          again.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">client_secret</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {result.clientSecret}
          </code>
          <CopyButton value={result.clientSecret} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ConfirmButton
        action={() => rotateApplicationSecret(clientId)}
        confirmLabel="Rotate secret"
        description="The current secret stops working immediately: Hydra keeps no overlap, so anything still holding the old one fails to authenticate until it is updated."
        onResult={setResult}
        size="sm"
        title="Rotate this client secret?"
        variant="outline"
      >
        Rotate secret
      </ConfirmButton>
      {result.error ? (
        <p className="text-destructive text-xs">{result.error}</p>
      ) : null}
    </div>
  );
}
