import type { ReactNode } from "react";

import Link from "next/link";
import { getRoleNamespaces, listPolicies, listRoles, type Role } from "@/adapters/authorization-service";
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
import { createRoleAction, deleteRoleAction } from "./actions";

function roleRow(role: Role, assignmentCount: number): ReactNode {
  return (
    <TableRow key={role.id}>
      <TableCell>{role.name}</TableCell>
      <TableCell className="font-mono text-xs">{role.id}</TableCell>
      <TableCell>
        <Badge variant="outline">{role.namespace}</Badge>
        <span className="ml-1 text-muted-foreground text-xs">.{role.relation}</span>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{role.description}</TableCell>
      <TableCell className="text-muted-foreground">
        {assignmentCount === 0 ? (
          "unused"
        ) : (
          <Link className="hover:underline" href={`/console/policies?role_id=${encodeURIComponent(role.id)}`}>
            {assignmentCount} assignment{assignmentCount === 1 ? "" : "s"}
          </Link>
        )}
      </TableCell>
      <TableCell>
        <form action={deleteRoleAction}>
          <ConfirmSubmitButton
            description={
              assignmentCount > 0
                ? `This role has ${assignmentCount} active assignment(s) — deleting it removes the name, but does not revoke the underlying Keto tuples those assignments point to.`
                : "This deletes the role's catalog entry. It has no active assignments."
            }
            name="id"
            title="Delete this role?"
            value={role.id}
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </TableCell>
    </TableRow>
  );
}

// Roles are named pointers at a real (namespace, relation) pair Keto's own
// namespace model already defines (ory/keto/namespaces/namespaces.ts) — not
// a parallel authorization system. Assigning a Role to a subject on
// /console/policies writes the real Keto relation tuple directly.
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase();
  const [fetchedRoles, namespaces, policies] = await Promise.all([
    listRoles(),
    getRoleNamespaces(),
    listPolicies(),
  ]);
  const targets = Object.entries(namespaces).flatMap(([namespace, relations]) =>
    relations.map((relation) => ({ label: `${namespace} → ${relation}`, value: `${namespace}:${relation}` })),
  );
  const assignmentCounts = new Map<string, number>();
  for (const policy of policies) {
    assignmentCounts.set(policy.role_id, (assignmentCounts.get(policy.role_id) ?? 0) + 1);
  }
  const roles = query
    ? fetchedRoles.filter(
        (r) =>
          r.id.toLowerCase().includes(query) ||
          r.name.toLowerCase().includes(query) ||
          r.namespace.toLowerCase().includes(query) ||
          r.relation.toLowerCase().includes(query),
      )
    : fetchedRoles;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Named roles over Keto's real namespace relations (Organization/Team/Project/Application/Resource). Keto remains the authorization engine — a role is just a friendly name for one of its relations."
        title="Roles"
      />

      <p className="text-muted-foreground text-sm">
        A role has no identity of its own in Keto — it is a name for a (namespace, relation) pair.
        Two roles pointing at the same pair (e.g. both naming Organization.admin) will show the
        exact same tuples as their &quot;usage&quot; below, and revoking one shows up as revoked
        for both. Give each role a distinct relation if you need them to track separately.
      </p>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Create role</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createRoleAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="id">ID</FieldLabel>
              <Input id="id" name="id" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="target">Keto relation</FieldLabel>
              <Select id="target" name="target">
                {targets.map((target) => (
                  <option key={target.value} value={target.value}>
                    {target.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Input id="description" name="description" />
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-4" method="get">
            <Field>
              <FieldLabel htmlFor="q">Search</FieldLabel>
              <Input defaultValue={params.q} id="q" name="q" placeholder="Name, namespace, or relation" />
            </Field>
            <Button type="submit">Search</Button>
            {params.q ? (
              <a className="text-muted-foreground text-sm underline" href="/auth/console/roles">
                Clear
              </a>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {roles.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {fetchedRoles.length === 0
            ? "No roles found — is authorization-service reachable?"
            : "No roles match this search."}
        </p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Keto relation</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>{roles.map((role) => roleRow(role, assignmentCounts.get(role.id) ?? 0))}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
