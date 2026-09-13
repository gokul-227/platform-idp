"use client";

import { type GroupStanding, STANDING_LABELS } from "@aec-craft/platform-sdk";
import { useAddMember } from "@aec-craft/platform-sdk/react";
import { Spinner } from "@aec-craft/ui/components/custom/spinner";
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
import { type FormEvent, type ReactNode, useState } from "react";

/**
 * Adding somebody by email.
 *
 * Email, not an identity id: nobody administering a tenant knows a Kratos uuid,
 * and platform's own `addMember` takes an address for exactly that reason. It
 * resolves the address against the directory and refuses one it does not know,
 * which is why the failure message here explains that the person has to sign in
 * once before they can hold a standing — there is no invitation to send yet, and
 * pretending otherwise would be a button that quietly does nothing.
 *
 * The standing options are the ones the caller may actually grant, computed from
 * their own permits by platform's own `mayGrant`. A manager sees `editor` and
 * `viewer`; an owner sees every standing including a peer owner, which is the
 * documented exception that lets a single-owner organization gain a second.
 */
export function AddMemberDialog({
  grantable,
  onOpenChange,
  open,
  orgId,
}: {
  grantable: GroupStanding[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  orgId: string;
}): ReactNode {
  const [email, setEmail] = useState("");
  const [standing, setStanding] = useState<GroupStanding>(
    grantable.at(-1) ?? "viewer"
  );
  const addMember = useAddMember();
  const isPending = addMember.isPending;
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean): void {
    if (isPending) {
      return;
    }
    if (!next) {
      setEmail("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await addMember.mutateAsync({
        scope: { orgId, type: "org" },
        input: { email: email.trim(), standing },
      });
      setEmail("");
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The member could not be added."
      );
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-email">Email</FieldLabel>
              <Input
                autoFocus
                id="member-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@company.com"
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
              <FieldLabel htmlFor="member-standing">Standing</FieldLabel>
              <Select
                onValueChange={(value) => setStanding(value as GroupStanding)}
                value={standing}
              >
                <SelectTrigger className="w-full" id="member-standing">
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
                    {grantable.map((option) => (
                      <SelectItem key={option} value={option}>
                        {STANDING_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                A standing reaches every project and team beneath this
                organization.
              </FieldDescription>
            </Field>
          </FieldGroup>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <DialogFooter>
            <DialogClose
              render={
                <Button disabled={isPending} type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            <Button
              disabled={isPending || grantable.length === 0}
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
