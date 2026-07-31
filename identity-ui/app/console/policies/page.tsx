import type { ReactNode } from "react";

import { listPolicies, listRoles, type Policy } from "@/adapters/authorization-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/vendor/ui/table";
import { PageHeader } from "../page.header";
import { createPolicyAction, deletePolicyAction } from "./actions";

function policyRow(policy: Policy): ReactNode {
  return (
    <TableRow key={policy.id}>
      <TableCell>{policy.role_name}</TableCell>
      <TableCell>
        <Badge variant="outline">{policy.namespace}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">{policy.object}</TableCell>
      <TableCell className="font-mono text-xs">{policy.subject_id}</TableCell>
      <TableCell>
        <form action={deletePolicyAction}>
          <ConfirmSubmitButton
            description={`This revokes ${policy.role_name} from ${policy.subject_id} on ${policy.object} — the underlying Keto tuple is deleted immediately.`}
            name="id"
            title="Revoke this policy?"
            value={policy.id}
          >
            Revoke
          </ConfirmSubmitButton>
        </form>
      </TableCell>
    </TableRow>
  );
}

// A Policy is a Role assigned to a subject on a specific object — and has
// no storage of its own. This page lists live Keto relation tuples (via
// authorization-service) and creates/deletes real tuples on submit; it does
// not maintain a separate authorization database.
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const roleIdFilter = params.role_id;
  const query = params.q?.trim().toLowerCase();
  const [fetched, roles] = await Promise.all([listPolicies(), listRoles()]);
  // authorization-service has no server-side filter on its policies list —
  // role_id/search are applied client-side over the already-fetched set.
  const policies = fetched.filter((p) => {
    if (roleIdFilter && p.role_id !== roleIdFilter) return false;
    if (query) {
      return (
        p.role_name.toLowerCase().includes(query) ||
        p.object.toLowerCase().includes(query) ||
        p.subject_id.toLowerCase().includes(query)
      );
    }
    return true;
  });
  const filteredRoleName = roleIdFilter
    ? roles.find((r) => r.id === roleIdFilter)?.name ?? roleIdFilter
    : undefined;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Assign a Role to a subject on a specific object — each row here is a real Keto relation tuple, read live and mutated directly, not a separate authorization store."
        title="Policies"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Assign role</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPolicyAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="role_id">Role</FieldLabel>
              <Select id="role_id" name="role_id">
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({role.namespace}.{role.relation})
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="object_id">Object ID</FieldLabel>
              <Input
                id="object_id"
                name="object_id"
                placeholder="e.g. an organization or project id"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="subject_id">Subject (identity) ID</FieldLabel>
              <Input id="subject_id" name="subject_id" required />
            </Field>
            <Button type="submit">Assign</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-4" method="get">
            {roleIdFilter ? <input name="role_id" type="hidden" value={roleIdFilter} /> : null}
            <Field>
              <FieldLabel htmlFor="q">Search</FieldLabel>
              <Input defaultValue={params.q} id="q" name="q" placeholder="Role, object, or subject" />
            </Field>
            <Button type="submit">Search</Button>
            {roleIdFilter || params.q ? (
              <a className="text-muted-foreground text-sm underline" href="/auth/console/policies">
                Clear
              </a>
            ) : null}
          </form>
          {roleIdFilter ? (
            <p className="mt-3 text-muted-foreground text-sm">
              Showing only assignments of role <span className="font-medium text-foreground">{filteredRoleName}</span>.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {policies.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {fetched.length === 0 ? "No policies assigned yet." : "No policies match these filters."}
        </p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Namespace</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>{policies.map(policyRow)}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
