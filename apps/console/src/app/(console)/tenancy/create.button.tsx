"use client";

import { useCreateAdminOrg } from "@aec-craft/platform-admin-sdk/react";
import { CreateDialog } from "@aec-craft/ui/components/blocks/create-dialog";
import { Button } from "@aec-craft/ui/components/primitives/button";
import { Field, FieldLabel } from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

/**
 * `ownerEmail` rides in `CreateDialog`'s `extraFields` slot: the dialog owns
 * `name`, this owns the field it doesn't know about, and both reach the same
 * submit. A rejected create keeps the dialog open with the platform's message.
 */
export function CreateOrganizationButton(): ReactNode {
  const router = useRouter();
  const createOrg = useCreateAdminOrg();
  const [open, setOpen] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");

  return (
    <>
      <Button onClick={() => setOpen(true)}>New organization</Button>
      <CreateDialog
        extraFields={
          <Field>
            <FieldLabel htmlFor="create-org-owner-email">
              Owner email
            </FieldLabel>
            <Input
              autoComplete="off"
              id="create-org-owner-email"
              onChange={(event) => setOwnerEmail(event.target.value)}
              placeholder="owner@example.com"
              required
              type="email"
              value={ownerEmail}
            />
          </Field>
        }
        onCreate={async ({ name }) => {
          const org = await createOrg.mutateAsync({
            name,
            ownerEmail: ownerEmail.trim(),
          });
          setOwnerEmail("");
          router.push(`/tenancy/${org.id}`);
        }}
        onOpenChange={setOpen}
        open={open}
        title="New organization"
      />
    </>
  );
}
