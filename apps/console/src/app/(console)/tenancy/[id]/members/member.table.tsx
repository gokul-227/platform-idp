"use client";

import {
  useAddAdminMember,
  useAdminMembers,
  useRemoveAdminMember,
  useSetAdminMemberStanding,
} from "@aec-craft/platform-admin-sdk/react";
import {
  type GroupStanding,
  type MemberResponse,
  STANDING_LABELS,
  STANDINGS,
} from "@aec-craft/platform-sdk";
import { SectionLoading } from "@aec-craft/ui/components/blocks/section";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aec-craft/ui/components/primitives/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aec-craft/ui/components/primitives/select";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { PlusIcon } from "@aec-craft/ui/icons";
import { toastError } from "@aec-craft/ui/lib/toast";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ConsoleTable } from "@/components/console.table";
import { QueryError } from "@/components/query.error";
import { MemberMenu } from "./member.menu";

/**
 * An organization's roster, read and written as the operator. The search and
 * the standing filter live in the URL (`ConsoleTable`) and narrow the roster
 * here, since platform's list takes no filter. Writes go to platform, which
 * owns the escalation guard and the audit row and still refuses to remove or
 * demote a group's last owner. Only a direct standing is editable: an inherited
 * one sits on a group above and is changed there.
 */

const COLUMNS = [
  {
    filter: { placeholder: "Email, name or id…", type: "search" as const },
    key: "member",
    label: "Email",
  },
  { className: "text-muted-foreground", label: "Name" },
  {
    filter: {
      options: STANDINGS.map((standing) => ({
        label: STANDING_LABELS[standing],
        value: standing,
      })),
      placeholder: "Any standing",
      type: "select" as const,
    },
    key: "standing",
    label: "Standing",
  },
  { className: "text-right", label: "" },
] as const;

/** `??` alone treats "" as present: a member added moments ago can carry an
 *  empty-string name from a profile join still catching up, which fell through
 *  to a bare "?" instead of the email beside it. */
function nonBlank(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function matches(
  member: MemberResponse,
  search: string,
  standing: string
): boolean {
  if (standing && member.standing !== standing) {
    return false;
  }
  const needle = search.toLowerCase();
  return (
    !needle ||
    [member.email, member.name, member.subject].some((value) =>
      value?.toLowerCase().includes(needle)
    )
  );
}

export function MembersTable({ orgId }: { orgId: string }): ReactNode {
  const searchParams = useSearchParams();
  const roster = useAdminMembers(orgId);
  const add = useAddAdminMember();
  const setStanding = useSetAdminMemberStanding();
  const remove = useRemoveAdminMember();
  const [isAdding, setIsAdding] = useState(false);
  const isPending = add.isPending || setStanding.isPending || remove.isPending;

  if (roster.isPending) {
    return <SectionLoading />;
  }
  if (roster.error) {
    return (
      <QueryError
        error={roster.error}
        onRetry={() => void roster.refetch()}
        subject="the roster"
      />
    );
  }
  const search = searchParams.get("member")?.trim() ?? "";
  const standingFilter = searchParams.get("standing") ?? "";
  const members = roster.data.items.filter((member) =>
    matches(member, search, standingFilter)
  );

  return (
    <>
      <ConsoleTable
        action={
          <Button onClick={() => setIsAdding(true)} size="sm">
            <PlusIcon data-icon="inline-start" />
            Add member
          </Button>
        }
        columns={COLUMNS}
        empty="No member matches."
      >
        {members.map((member) => (
          <TableRow key={member.subject}>
            {/* The address is the identifier and the link, as on the
                identities table; the name sits beside it and is not clickable.
                No avatar: a roster read for who holds what does not need a
                monogram in front of every row. */}
            <TableCell>
              <Link
                className="hover:underline"
                href={`/identities/${encodeURIComponent(member.subject)}`}
              >
                {nonBlank(member.email) ?? member.subject}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {nonBlank(member.name) ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {STANDING_LABELS[
                  member.standing as keyof typeof STANDING_LABELS
                ] ?? member.standing}
              </Badge>
              {member.source === "direct" ? null : (
                <span className="ml-2 text-muted-foreground text-xs">
                  from the organization
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">
              {member.source === "direct" ? (
                <MemberMenu
                  isPending={isPending}
                  label={member.email ?? member.subject}
                  onRemove={() =>
                    remove
                      .mutateAsync({ orgId, subject: member.subject })
                      .catch(toastError)
                  }
                  onStandingChange={(next) =>
                    setStanding
                      .mutateAsync({
                        orgId,
                        standing: next,
                        subject: member.subject,
                      })
                      .catch(toastError)
                  }
                  standing={member.standing}
                />
              ) : (
                // A standing inherited from the organization is not this row's
                // to change: it is removed where it was granted.
                <span className="inline-block size-9" />
              )}
            </TableCell>
          </TableRow>
        ))}
      </ConsoleTable>
      <AddMemberDialog
        isPending={isPending}
        onOpenChange={setIsAdding}
        onSubmit={(email, standing) =>
          add
            .mutateAsync({ orgId, input: { email, standing } })
            .then(() => setIsAdding(false))
            .catch(toastError)
        }
        open={isAdding}
      />
    </>
  );
}

function AddMemberDialog({
  isPending,
  onOpenChange,
  onSubmit,
  open,
}: {
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (email: string, standing: GroupStanding) => void;
  open: boolean;
}): ReactNode {
  const [email, setEmail] = useState("");
  const [standing, setStanding] = useState<GroupStanding>("viewer");
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(email.trim(), standing);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="console-member-email">Email</FieldLabel>
              <Input
                id="console-member-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
              <FieldDescription>
                They need a buildOS account already; adding grants a standing,
                it does not send an invitation.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="console-member-standing">
                Standing
              </FieldLabel>
              <Select
                onValueChange={(value) => setStanding(value as GroupStanding)}
                value={standing}
              >
                <SelectTrigger className="w-full" id="console-member-standing">
                  {/* base-ui's Select.Value renders the raw value string unless
                    given a render function — unlike Radix, it does not mirror
                    the selected Item's own children. */}
                  <SelectValue>
                    {(value: GroupStanding | null) =>
                      value ? STANDING_LABELS[value] : null
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {STANDINGS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {STANDING_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button disabled={isPending} type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            <Button
              disabled={isPending || email.trim().length === 0}
              type="submit"
            >
              {isPending ? <Spinner className="size-4" /> : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
