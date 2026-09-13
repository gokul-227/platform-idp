"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import { CheckIcon, CopyIcon } from "@aec-craft/ui/icons";
import { type ReactNode, useState } from "react";

export function CopyButton({ value }: { value: string }): ReactNode {
  const [hasCopied, setHasCopied] = useState(false);

  function handleCopy(): void {
    navigator.clipboard.writeText(value).then(() => {
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 1500);
    });
  }

  return (
    <Button
      aria-label="Copy to clipboard"
      className="size-6"
      onClick={handleCopy}
      size="icon"
      variant="ghost"
    >
      {hasCopied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
