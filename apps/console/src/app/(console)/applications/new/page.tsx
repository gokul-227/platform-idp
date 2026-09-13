import { Card, CardContent } from "@aec-craft/ui/components/primitives/card";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page.header";
import { ApplicationCreateForm } from "./application.create.form";

export default function Page(): ReactNode {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        description="A confidential client’s secret is shown once, here, and never again."
        title="New application"
      />
      <Card>
        <CardContent>
          <ApplicationCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
