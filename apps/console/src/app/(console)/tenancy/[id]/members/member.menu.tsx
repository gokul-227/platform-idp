"use client";

import {
  type GroupStanding,
  STANDING_LABELS,
  STANDINGS,
} from "@aec-craft/platform-sdk";
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
import { DotsThreeVerticalIcon, TrashIcon } from "@aec-craft/ui/icons";
import { type ReactNode, useState } from "react";
import { DestructiveDialog } from "@/components/destructive.dialog";

/**
 * What can be done to one member, in the menu the rest of the console uses.
 *
 * The standing is a radio group here rather than a select in the cell: the
 * levels are exclusive, and a dropdown sitting in every row made the column
 * read as a form rather than as what somebody holds.
 */
export function MemberMenu({
  isPending,
  label,
  onRemove,
  onStandingChange,
  standing,
}: {
  isPending: boolean;
  /** How the person reads on screen, for the confirmation's own sentence. */
  label: string;
  onRemove: () => void;
  onStandingChange: (next: GroupStanding) => void;
  standing: string;
}): ReactNode {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Actions for ${label}`}
              disabled={isPending}
              size="icon"
              variant="ghost"
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* The label is Base UI's `GroupLabel` and throws outside a group, so
              it belongs inside the radio group rather than above it. */}
          <DropdownMenuRadioGroup
            onValueChange={(value) => onStandingChange(value as GroupStanding)}
            value={standing}
          >
            <DropdownMenuLabel>Standing</DropdownMenuLabel>
            {STANDINGS.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {STANDING_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmingRemove(true)}
            variant="destructive"
          >
            <TrashIcon />
            Remove from organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu, which unmounts its content on close and would take
          the dialog with it. */}
      <DestructiveDialog
        confirmLabel="Remove member"
        description={`${label} loses every permit this organization grants. Their account is not affected.`}
        isPending={isPending}
        onConfirm={() => {
          setConfirmingRemove(false);
          onRemove();
        }}
        onOpenChange={setConfirmingRemove}
        open={confirmingRemove}
        title="Remove this member?"
      />
    </>
  );
}
