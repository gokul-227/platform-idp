import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { listRegistryApps } from "@/adapters/app-registry";
import { Button, buttonVariants } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { PageHeader } from "../../../page.header";
import { updateAppAction } from "../../actions";

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}): Promise<ReactNode> {
  const { clientId } = await params;
  const apps = await listRegistryApps();
  const app = apps.find((candidate) => candidate.client_id === clientId);
  if (!app) {
    notFound();
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Full field edit — calls platform/app-registry's PUT /api/v1/registry/{client_id}, which overwrites the YAML definition and re-syncs Hydra. Note: unlike enable/disable, this rewrites the whole file, so hand-written comments in it are lost."
        title={`Edit ${app.client_name}`}
      />
      <Card className="gap-4">
        <CardContent>
          <form action={updateAppAction} className="flex flex-col gap-4">
            <input name="client_id" type="hidden" value={app.client_id} />
            <Field>
              <FieldLabel htmlFor="client_name">Name</FieldLabel>
              <Input
                defaultValue={app.client_name}
                id="client_name"
                name="client_name"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="redirect_uris">
                Redirect URIs (comma-separated)
              </FieldLabel>
              <Input
                defaultValue={app.redirect_uris.join(", ")}
                id="redirect_uris"
                name="redirect_uris"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scope">Scope</FieldLabel>
              <Input defaultValue={app.scope} id="scope" name="scope" />
            </Field>
            <Field>
              <FieldLabel htmlFor="tags">Tags (comma-separated)</FieldLabel>
              <Input defaultValue={app.tags.join(", ")} id="tags" name="tags" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <a
                className={buttonVariants({ variant: "outline" })}
                href="/auth/console/applications"
              >
                Cancel
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
