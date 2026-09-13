"use client";

import { useDeleteAdminOrg } from "@aec-craft/platform-admin-sdk/react";
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
import { toastError } from "@aec-craft/ui/lib/toast";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { DestructiveDialog } from "@/components/destructive.dialog";
import { EditOrganizationButton } from "./edit.button";

/**
 * What can be done to one organization, in the menu beside its title — the
 * same shape identities and applications use, so a detail page reads the same
 * whatever it is about.
 */
export function OrganizationMenu({
  name,
  orgId,
  slug,
}: {
  name: string;
  orgId: string;
  slug: string;
}): ReactNode {
  const router = useRouter();
  const deleteOrg = useDeleteAdminOrg();
  const [isRenaming, setIsRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function remove(): Promise<void> {
    setConfirmingDelete(false);
    try {
      await deleteOrg.mutateAsync(orgId);
      router.push("/tenancy");
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Actions"
              disabled={deleteOrg.isPending}
              size="icon"
              variant="ghost"
            >
              <DotsThreeVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setIsRenaming(true)}>
            <PencilSimpleIcon />
            Rename
          </DropdownMenuItem>
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

      {/* Both outside the menu, which unmounts its content on close and would
          take an open dialog with it. */}
      <EditOrganizationButton
        name={name}
        onOpenChange={setIsRenaming}
        open={isRenaming}
        orgId={orgId}
        slug={slug}
      />
      <DestructiveDialog
        confirmLabel="Delete organization"
        confirmPhrase={name}
        description={`${name} and everything inside it — members, and every standing granted on it — is removed immediately. This cannot be undone.`}
        isPending={deleteOrg.isPending}
        onConfirm={() => void remove()}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        title="Delete this organization?"
      />
    </div>
  );
}
