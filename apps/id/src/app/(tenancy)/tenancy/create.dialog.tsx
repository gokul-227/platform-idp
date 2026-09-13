"use client";

import { useCreateOrg } from "@aec-craft/platform-sdk/react";
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
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { toSlug } from "@/lib/slug";

/**
 * Creating an organization.
 *
 * Not `@aec-craft/ui`'s `CreateDialog`, and the reason is the handle. That block
 * offers one name field and derives the slug server-side without showing it;
 * here the slug is the organization's URL and a person should see it before
 * committing, so the form is two fields with the second tracking the first until
 * it is edited. Everything else — the dialog, field and button primitives — is
 * the design system's.
 *
 * `POST /orgs` makes the caller the first owner, which is why it runs as the
 * person and never as this service. Success navigates to the new organization
 * rather than closing onto the list: whoever just created it wants to be in it.
 */
export function CreateOrganizationDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): ReactNode {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const createOrg = useCreateOrg();
  const isPending = createOrg.isPending;
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = isSlugEdited ? slug : toSlug(name);
  const isValid = name.trim().length > 0;

  function reset(): void {
    setName("");
    setSlug("");
    setIsSlugEdited(false);
    setError(null);
  }

  function handleOpenChange(next: boolean): void {
    // A dialog closed mid-flight would leave the action running with nothing
    // to report back to.
    if (isPending) {
      return;
    }
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setError(null);
    const candidate = toSlug(effectiveSlug);
    try {
      const org = await createOrg.mutateAsync({
        name: name.trim(),
        // Platform derives a slug from the name when the field is absent, so
        // absent is what an unusable candidate becomes.
        ...(candidate.length > 0 ? { slug: candidate } : {}),
      });
      reset();
      onOpenChange(false);
      router.push(`/tenancy/${org.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The organization could not be created."
      );
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-name">
                Organization name
              </FieldLabel>
              <Input
                autoFocus
                id="organization-name"
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="organization-slug">Handle</FieldLabel>
              <Input
                id="organization-slug"
                maxLength={64}
                onChange={(event) => {
                  setIsSlugEdited(true);
                  setSlug(event.target.value);
                }}
                value={effectiveSlug}
              />
              <FieldDescription>
                Lowercase letters, digits and dashes. If it is taken, a number
                is appended.
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
            <Button disabled={isPending || !isValid} type="submit">
              {isPending ? (
                <Spinner className="size-4" />
              ) : (
                "Create organization"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
