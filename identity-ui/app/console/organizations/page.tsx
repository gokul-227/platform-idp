import Link from "next/link";
import type { ReactNode } from "react";

import { listRelationTuples } from "@/adapters/admin";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/vendor/ui/table";
import { listTenants, type Tenant } from "@/adapters/tenant-service";
import { PageHeader } from "../page.header";
import { createOrganizationAction, deleteOrganizationAction } from "./actions";

async function organizationRow(tenant: Tenant): Promise<ReactNode> {
  const members = await listRelationTuples("Organization", tenant.id);
  return (
    <TableRow key={tenant.id}>
      <TableCell>
        <Link className="hover:underline" href={`/console/organizations/${encodeURIComponent(tenant.id)}`}>
          {tenant.name}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{tenant.domain ?? ""}</TableCell>
      <TableCell>
        <Badge variant="outline">{tenant.status}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{members.length}</TableCell>
      <TableCell className="text-muted-foreground">
        {tenant.created_at.replace("T", " ").slice(0, 16)}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Link href={`/console/organizations/${encodeURIComponent(tenant.id)}`}>
            <Button size="sm" variant="outline">
              Manage
            </Button>
          </Link>
          <form action={deleteOrganizationAction}>
            <ConfirmSubmitButton
              description="This permanently deletes the organization (platform/tenant-service record) and every membership relation on it. This cannot be undone."
              name="organization_id"
              title="Delete this organization?"
              value={tenant.id}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Organizations = platform/tenant-service's tenants (Postgres — name/
// domain/status, already the real create+list source of truth) plus Keto
// Organization relation tuples for membership (admin/member/billing_admin
// — same relations platform/hooks writes on registration). No new entity
// model: this page composes two mechanisms that already existed rather
// than inventing a third "organization" concept. Members/invitations/
// groups/roles/permissions/audit live on the detail page (Manage) — this
// list is create + overview + delete only, matching the Applications/
// Clients list-vs-detail split.
export default async function OrganizationsPage(): Promise<ReactNode> {
  const tenants = await listTenants();
  const rows = await Promise.all(tenants.map(organizationRow));

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Organizations are platform/tenant-service tenants; membership is Keto Organization relation tuples. Create calls tenant-service. Manage a specific organization's members, invitations, groups, roles, and permissions from its own detail page."
        title="Organizations"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Create organization</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={createOrganizationAction}
            className="flex flex-wrap items-end gap-4"
          >
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="domain">Domain (optional)</FieldLabel>
              <Input id="domain" name="domain" />
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      {tenants.length === 0 ? (
        <p className="text-muted-foreground text-sm">No organizations yet.</p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>{rows}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
