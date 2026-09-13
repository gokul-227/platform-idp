"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import { toastError } from "@aec-craft/ui/lib/toast";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { DestructiveDialog } from "./destructive.dialog";

/**
 * A destructive action that lives on the page rather than in a menu: the button
 * and its confirmation together, over the one `DestructiveDialog`.
 *
 * `onResult` is for the actions that answer with something the admin has to
 * see, a rotated secret above all; the rest resolve to nothing.
 */
export function ConfirmButton<T>({
  action,
  children,
  confirmLabel,
  description,
  onResult,
  size,
  title,
  variant = "destructive",
}: {
  /** From a server component, a server action bound to its arguments. */
  action: () => Promise<T>;
  children: ReactNode;
  /** The verb the dialog's own button says. */
  confirmLabel: string;
  description: string;
  onResult?: (result: T) => void;
  size?: "sm" | "default";
  title: string;
  variant?: "destructive" | "outline" | "ghost";
}): ReactNode {
  const [open, setOpen] = useState(false);
  const confirm = useMutation({
    mutationFn: action,
    onSuccess: (result) => onResult?.(result),
    onError: (error) => toastError(error),
  });
  const isPending = confirm.isPending;

  function handleConfirm(): void {
    setOpen(false);
    confirm.mutate();
  }

  return (
    <>
      <Button
        disabled={isPending}
        onClick={() => setOpen(true)}
        size={size}
        variant={variant}
      >
        {children}
      </Button>
      <DestructiveDialog
        confirmLabel={confirmLabel}
        description={description}
        isPending={isPending}
        onConfirm={handleConfirm}
        onOpenChange={setOpen}
        open={open}
        title={title}
      />
    </>
  );
}
