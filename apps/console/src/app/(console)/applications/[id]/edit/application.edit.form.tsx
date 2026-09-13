"use client";

import { Spinner } from "@aec-craft/ui/components/custom/spinner";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  type ApplicationDefaults,
  ApplicationFields,
} from "../../application.fields";
import { useUpdateApplication } from "../../application.hooks";

/**
 * Changes an existing registration. The fields are the create form's minus the
 * ones a deployed client is already built on: `/edit`'s second card says which
 * and why, rather than leaving an operator to notice what is missing.
 */
export function ApplicationEditForm({
  clientId,
  defaults,
  name,
}: {
  clientId: string;
  defaults: ApplicationDefaults;
  name: string;
}): ReactNode {
  const router = useRouter();
  const update = useUpdateApplication();
  const isPending = update.isPending;
  const error = update.error?.message ?? null;

  return (
    <form
      action={(formData) =>
        update.mutate(formData, {
          onSuccess: () => router.push(`/applications/${clientId}`),
        })
      }
    >
      <input name="id" readOnly type="hidden" value={clientId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input defaultValue={name} id="name" name="name" required />
        </Field>

        <ApplicationFields defaults={defaults} />

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Field orientation="horizontal">
          <Button disabled={isPending} type="submit">
            {isPending ? <Spinner className="size-4" /> : "Save changes"}
          </Button>
          <Link
            className="text-muted-foreground text-sm hover:underline"
            href={`/applications/${clientId}`}
          >
            Cancel
          </Link>
        </Field>
      </FieldGroup>
    </form>
  );
}
