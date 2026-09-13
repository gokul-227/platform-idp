"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@aec-craft/ui/components/primitives/alert-dialog";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { Label } from "@aec-craft/ui/components/primitives/label";
import { type ReactNode, useActionState } from "react";
import { type DeleteAccountResult, deleteAccount } from "./danger.actions";

const EMPTY: DeleteAccountResult = {};

/**
 * Closing the account.
 *
 * The dialog states what goes and what the platform may refuse, because the
 * refusal is a designed answer rather than an error: somebody who is the last
 * owner of an organization keeps their account until they hand it over, and
 * being told that after typing your own address is better than being told it
 * instead of a confirmation.
 */
export function DangerSection({ email }: { email: string }): ReactNode {
  const [result, submit, isPending] = useActionState(deleteAccount, EMPTY);

  return (
    <div className="flex flex-col items-end gap-3">
      {result.error ? (
        <p className="text-destructive text-sm">{result.error}</p>
      ) : null}

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button disabled={isPending} size="sm" variant="destructive" />
          }
        >
          Close my account
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form action={submit} className="flex flex-col gap-5">
            <AlertDialogHeader>
              <AlertDialogTitle>Close this account?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything above goes with it, and nothing here can bring it
                back. If you own an organization or a project on your own, hand
                it over first and we will tell you which.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">
                Type <span className="text-foreground">{email}</span> to confirm
              </Label>
              <Input
                autoComplete="off"
                id="confirm"
                name="confirm"
                required
                spellCheck={false}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <Button disabled={isPending} type="submit" variant="destructive">
                Close my account
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
