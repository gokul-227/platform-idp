"use client";

import {
  type GroupStanding,
  type MemberResponse,
  STANDING_LABELS,
} from "@aec-craft/platform-sdk";
import {
  useRemoveMember,
  useSetMemberStanding,
} from "@aec-craft/platform-sdk/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aec-craft/ui/components/primitives/alert-dialog";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import { DotsThreeVerticalIcon } from "@aec-craft/ui/icons";
import { toastError } from "@aec-craft/ui/lib/toast";
import { type ReactNode, useState } from "react";
import { AddMemberDialog } from "./add.dialog";

/**
 * The roster, as people rather than as identifiers: platform's members list
 * returns the profile beside the standing, so a row shows a name and an address
 * rather than the Kratos uuid it used to render in a monospace column.
 */

export type MemberRow = MemberResponse;

/** `??` alone treats "" as present: a member added moments ago can carry an
 *  empty-string name from a profile join still catching up. */
function nonBlank(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function MembersView({
  canManage,
  grantable,
  members,
  orgId,
}: {
  canManage: boolean;
  grantable: GroupStanding[];
  members: MemberRow[];
  orgId: string;
}): ReactNode {
  const [isAdding, setIsAdding] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<MemberRow | null>(null);
  const scope = { orgId, type: "org" as const };
  const setStanding = useSetMemberStanding();
  const remove = useRemoveMember();
  const isPending = setStanding.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4">
      {members.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nobody holds a standing here yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {members.map((member) => (
            <li
              className="flex items-center gap-3 border-rule border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
              key={member.subject}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm">
                  {/* No user row means a service account, not somebody yet to
                      arrive: platform resolves an address against the directory
                      and refuses one it does not know. */}
                  {nonBlank(member.name) ??
                    nonBlank(member.email) ??
                    "Service account"}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {nonBlank(member.email) ??
                    (nonBlank(member.name) ? null : member.subject)}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {member.source === "inherited" ? (
                  <span className="text-muted-foreground text-xs">
                    Inherited
                  </span>
                ) : null}
                <Badge variant="outline">
                  {STANDING_LABELS[member.standing]}
                </Badge>
                <MemberMenu
                  canManage={canManage}
                  grantable={grantable}
                  isPending={isPending}
                  member={member}
                  onRemove={() => setPendingRemoval(member)}
                  onStanding={(standing) =>
                    setStanding
                      .mutateAsync({ scope, standing, subject: member.subject })
                      .catch(toastError)
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <Button
          className="w-fit"
          disabled={isPending}
          onClick={() => setIsAdding(true)}
          size="sm"
          variant="outline"
        >
          Add member
        </Button>
      ) : null}

      <AddMemberDialog
        grantable={grantable}
        onOpenChange={setIsAdding}
        open={isAdding}
        orgId={orgId}
      />
      <RemoveMemberDialog
        member={pendingRemoval}
        onConfirm={() => {
          const member = pendingRemoval;
          setPendingRemoval(null);
          if (member) {
            remove
              .mutateAsync({ scope, subject: member.subject })
              .catch(toastError);
          }
        }}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      />
    </div>
  );
}

/**
 * Removing somebody takes away everything beneath the organization too, so it is
 * a confirmation rather than a menu item that fires.
 */
function RemoveMemberDialog({
  member,
  onConfirm,
  onOpenChange,
}: {
  member: MemberRow | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const who = member?.name ?? member?.email ?? "this member";
  return (
    <AlertDialog onOpenChange={onOpenChange} open={member !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {who}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to this organization and to every project and team
            beneath it. Their account is not deleted, and they can be added
            again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            render={<Button variant="outline">Cancel</Button>}
          />
          <AlertDialogAction
            render={
              <Button onClick={onConfirm} variant="destructive">
                Remove member
              </Button>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MemberMenu({
  canManage,
  grantable,
  isPending,
  member,
  onRemove,
  onStanding,
}: {
  canManage: boolean;
  grantable: GroupStanding[];
  isPending: boolean;
  member: MemberRow;
  onRemove: () => void;
  onStanding: (standing: GroupStanding) => void;
}): ReactNode {
  // An inherited standing lives on a group above this one; platform refuses a
  // write against it here, so there is no menu rather than a menu whose every
  // item fails.
  if (!canManage || member.source === "inherited") {
    return null;
  }
  const options = grantable.filter((standing) => standing !== member.standing);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Manage ${member.name ?? member.email ?? "member"}`}
            disabled={isPending}
            size="icon"
            variant="ghost"
          >
            <DotsThreeVerticalIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {options.map((standing) => (
          <DropdownMenuItem key={standing} onClick={() => onStanding(standing)}>
            Change to {STANDING_LABELS[standing]}
          </DropdownMenuItem>
        ))}
        {options.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={onRemove} variant="destructive">
          Remove from organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
