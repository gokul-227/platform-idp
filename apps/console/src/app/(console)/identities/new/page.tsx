import { Card, CardContent } from "@aec-craft/ui/components/primitives/card";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page.header";
import { IdentityCreateForm } from "./identity.create.form";

export default function Page(): ReactNode {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        description="Creates a verified account with no password. Hand it over with a recovery link."
        title="New identity"
      />
      <Card>
        <CardContent>
          <IdentityCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
