"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import {
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@aec-craft/ui/icons";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { DestructiveDialog } from "@/components/destructive.dialog";
import { useDeleteApplication } from "./application.hooks";

/**
 * Everything you can do to one application, in the same menu shape the identity
 * rows use: a row offers what its detail page offers, so neither is the only
 * place to act.
 */
export function ApplicationMenu({
  id,
  name,
}: {
  id: string;
  /** Null when the client carries no name; the dialog's sentence needs a
   *  subject either way, and writing one is this component's job rather than
   *  each caller's. */
  name: string | null;
}): ReactNode {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = useDeleteApplication();

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Actions"
              disabled={remove.isPending}
              size="icon"
              variant="ghost"
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => router.push(`/applications/${id}/edit`)}
          >
            <PencilSimpleIcon />
            Edit
          </DropdownMenuItem>
          {/* Its own section: one is reversible and the other is not. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmingDelete(true)}
            variant="destructive"
          >
            <TrashIcon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu, which unmounts its content on close and would take
          the dialog with it. Typed, because every integration holding this
          client id stops working and no undo puts it back. */}
      <DestructiveDialog
        confirmLabel="Delete application"
        confirmPhrase={name ?? undefined}
        description={`Deletes ${name ?? "this application"}. Issued tokens are revoked and the client can no longer authenticate.`}
        isPending={remove.isPending}
        onConfirm={() => {
          setConfirmingDelete(false);
          remove.mutate(id, { onSuccess: () => router.push("/applications") });
        }}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        title="Delete this application?"
      />
    </div>
  );
}
