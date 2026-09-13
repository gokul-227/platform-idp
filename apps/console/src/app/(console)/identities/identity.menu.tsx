"use client";

import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import {
  DotsThreeVerticalIcon,
  ProhibitIcon,
  TrashIcon,
} from "@aec-craft/ui/icons";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { DestructiveDialog } from "@/components/destructive.dialog";
import {
  AUTHORITY_LABELS,
  type Authority,
  NO_AUTHORITY_LABEL,
} from "@/lib/authority";
import {
  useDeleteIdentity,
  useUpdateConsoleAccess,
  useUpdateIdentityState,
} from "./identity.hooks";

/** The four levels, narrowest first, as one list to pick from. `user` is the
 *  absence of access; `root` is configuration and never writable here. */
const LEVELS: { hint?: string; label: string; value: Authority | "user" }[] = [
  { label: NO_AUTHORITY_LABEL, value: "user" },
  { label: AUTHORITY_LABELS.staff, value: "staff" },
  { label: AUTHORITY_LABELS.admin, value: "admin" },
  { hint: "set in ROOT_EMAILS", label: AUTHORITY_LABELS.root, value: "root" },
];

/**
 * Everything an admin can do to one identity, in one menu beside the title.
 * Access is a radio group because the levels are exclusive, and what is refused
 * shows as unavailable rather than missing, so the ladder is legible even where
 * it cannot be climbed.
 */
export function IdentityMenu({
  actorAuthority,
  authority,
  email,
  id,
  isActive,
}: {
  actorAuthority: "admin" | "root";
  authority: Authority | null;
  email?: string;
  id: string;
  isActive: boolean;
}): ReactNode {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const current = authority ?? "user";
  const access = useUpdateConsoleAccess();
  const state = useUpdateIdentityState();
  const remove = useDeleteIdentity();
  const isPending = access.isPending || state.isPending || remove.isPending;

  function choose(next: string): void {
    if (next === current || next === "root") {
      return;
    }
    access.mutate({ id, next: next === "user" ? null : (next as Authority) });
  }

  /** Root is configuration and cannot be picked; only a root appoints or
   *  unappoints an admin, a root's own row included. */
  function unavailable(value: string): boolean {
    if (value === "root") {
      return true;
    }
    return (
      actorAuthority !== "root" && (value === "admin" || authority === "admin")
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Actions"
              disabled={isPending}
              size="icon"
              variant="ghost"
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* The label is Base UI's `GroupLabel` and throws outside a group,
              so it belongs inside the radio group rather than above it. */}
          <DropdownMenuRadioGroup onValueChange={choose} value={current}>
            <DropdownMenuLabel>Access</DropdownMenuLabel>
            {LEVELS.map((level) => (
              <DropdownMenuRadioItem
                disabled={unavailable(level.value)}
                key={level.value}
                value={level.value}
              >
                {level.label}
                {level.hint ? (
                  <span className="ml-auto text-muted-foreground text-xs">
                    {level.hint}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              state.mutate({ id, state: isActive ? "inactive" : "active" })
            }
          >
            <ProhibitIcon />
            {isActive ? "Deactivate" : "Activate"}
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
          the dialog with it. Typed, because this is somebody else's account and
          cannot be restored; deactivating, one item above, can. */}
      <DestructiveDialog
        confirmLabel="Delete identity"
        confirmPhrase={email}
        description={`Permanently deletes ${email ?? id} and all its sessions and credentials.`}
        isPending={isPending}
        onConfirm={() => {
          setConfirmingDelete(false);
          remove.mutate(id, { onSuccess: () => router.push("/identities") });
        }}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        title="Delete this identity?"
      />
    </>
  );
}
