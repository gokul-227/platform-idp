"use client";

import { useUpdateAdminOrg } from "@aec-craft/platform-admin-sdk/react";
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
import { Field, FieldLabel } from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { PencilSimpleIcon } from "@aec-craft/ui/icons";
import { type FormEvent, type ReactNode, useState } from "react";

/**
 * Composed directly from `ui`'s primitives rather than `CreateDialog`: that
 * block's Name field has no way to start pre-filled and its submit button has
 * no way to read anything but "Create" — both fixed values, not props, on the
 * published component. Editing needs both to differ from creating, so this
 * stays a small composition rather than a block that can't express it.
 */
export function EditOrganizationButton({
  name,
  onOpenChange,
  open: controlledOpen,
  orgId,
  slug,
}: {
  name: string;
  /** Set together with `open` to drive this from a menu, which then renders
   *  the trigger itself. */
  onOpenChange?: (next: boolean) => void;
  open?: boolean;
  orgId: string;
  slug: string;
}): ReactNode {
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : ownOpen;
  const setOpen = isControlled
    ? (onOpenChange ?? (() => undefined))
    : setOwnOpen;
  const [nextName, setNextName] = useState(name);
  const [nextSlug, setNextSlug] = useState(slug);
  const updateOrg = useUpdateAdminOrg();
  const isPending = updateOrg.isPending;
  const [error, setError] = useState<string | null>(null);
  const trimmedName = nextName.trim();
  const trimmedSlug = nextSlug.trim();
  const isValid = trimmedName.length >= 1 && trimmedSlug.length >= 1;

  function handleOpenChange(next: boolean): void {
    if (isPending) {
      return;
    }
    if (!next) {
      setNextName(name);
      setNextSlug(slug);
      setError(null);
    }
    setOpen(next);
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!isValid || isPending) {
      return;
    }
    setError(null);
    try {
      await updateOrg.mutateAsync({
        orgId,
        input: {
          ...(trimmedName === name ? {} : { name: trimmedName }),
          ...(trimmedSlug === slug ? {} : { slug: trimmedSlug }),
        },
      });
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The change was refused."
      );
    }
  }

  return (
    <>
      {isControlled ? null : (
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          <PencilSimpleIcon data-icon="inline-start" />
          Edit
        </Button>
      )}
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit organization</DialogTitle>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="edit-org-name">Name</FieldLabel>
              <Input
                autoFocus
                disabled={isPending}
                id="edit-org-name"
                maxLength={100}
                onChange={(event) => setNextName(event.target.value)}
                value={nextName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-org-slug">Slug</FieldLabel>
              <Input
                disabled={isPending}
                id="edit-org-slug"
                maxLength={64}
                onChange={(event) => setNextSlug(event.target.value)}
                value={nextSlug}
              />
            </Field>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button disabled={isPending} type="button" variant="outline">
                    Cancel
                  </Button>
                }
              />
              <Button disabled={!isValid || isPending} type="submit">
                {isPending ? <Spinner className="size-4" /> : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
