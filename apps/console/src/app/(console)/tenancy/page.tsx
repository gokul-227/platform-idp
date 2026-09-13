import type { ReactNode } from "react";
import { PageHeader } from "@/components/page.header";
import { CreateOrganizationButton } from "./create.button";
import { OrganizationsTable } from "./organization.table";

export default function Page(): ReactNode {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        actions={<CreateOrganizationButton />}
        description="Every organization on the platform, and who holds a standing on it."
        title="Organizations"
      />
      <OrganizationsTable />
    </div>
  );
}
