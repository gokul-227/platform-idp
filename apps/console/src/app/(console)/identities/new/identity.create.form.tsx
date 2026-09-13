"use client";

import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCreateIdentity } from "../identity.hooks";

export function IdentityCreateForm(): ReactNode {
  const router = useRouter();
  const create = useCreateIdentity();
  const isPending = create.isPending;

  return (
    <form
      action={(formData) =>
        create.mutate(formData, {
          onSuccess: (id) => router.push(`/identities/${id}`),
        })
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" required type="email" />
          <FieldDescription>
            Created pre-verified; hand access over with a recovery link from the
            detail page.
          </FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="first">First name</FieldLabel>
            <Input id="first" name="first" />
          </Field>
          <Field>
            <FieldLabel htmlFor="last">Last name</FieldLabel>
            <Input id="last" name="last" />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Button disabled={isPending} type="submit">
            {isPending ? <Spinner className="size-4" /> : "Create identity"}
          </Button>
          <Link
            className="text-muted-foreground text-sm hover:underline"
            href="/identities"
          >
            Cancel
          </Link>
        </Field>
      </FieldGroup>
    </form>
  );
}
