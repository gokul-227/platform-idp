"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aec-craft/ui/components/primitives/alert-dialog";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { Label } from "@aec-craft/ui/components/primitives/label";
import { type ReactNode, useEffect, useState } from "react";

/**
 * The one destructive confirmation in the console. Controlled, because a
 * trigger inside a dropdown menu unmounts with it and takes an uncontrolled
 * dialog along; `ConfirmButton` is the uncontrolled shape over this one.
 *
 * `confirmPhrase` is for what cannot be undone, and nothing else. It is a
 * deliberation gate, not a check: what a caller may do is settled server-side,
 * and typing an address proves only that the person read which account they
 * are on.
 */
export function DestructiveDialog({
  confirmLabel,
  confirmPhrase,
  description,
  isPending,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  /** The verb. A dialog whose buttons say Cancel and Confirm makes the reader
   *  reconstruct what they agreed to from the title. */
  confirmLabel: string;
  confirmPhrase?: string | undefined;
  description: string;
  isPending?: boolean | undefined;
  onConfirm: () => void;
  onOpenChange: (next: boolean) => void;
  open: boolean;
  title: string;
}): ReactNode {
  const [typed, setTyped] = useState("");

  // Reopening after a cancel must not arrive already satisfied.
  useEffect(() => {
    if (!open) {
      setTyped("");
    }
  }, [open]);

  const isBlocked = confirmPhrase !== undefined && typed !== confirmPhrase;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {confirmPhrase === undefined ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="destructive-confirm">
              Type <span className="text-foreground">{confirmPhrase}</span> to
              confirm
            </Label>
            <Input
              autoComplete="off"
              id="destructive-confirm"
              onChange={(event) => setTyped(event.target.value)}
              spellCheck={false}
              value={typed}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={isBlocked || isPending}
            onClick={onConfirm}
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
