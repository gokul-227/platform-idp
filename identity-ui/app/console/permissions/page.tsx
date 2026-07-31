import type { ReactNode } from "react";

import {
  checkPermission,
  formatSubject,
  KETO_NAMESPACES,
  listRelationTuples,
  type RelationTuple,
} from "@/adapters/admin";
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
import { createRelationTupleAction, deleteRelationTupleAction } from "./actions";

function tupleRow(tuple: RelationTuple): ReactNode {
  const subject = formatSubject(tuple);
  return (
    <TableRow
      key={`${tuple.namespace}:${tuple.object}#${tuple.relation}@${subject}`}
    >
      <TableCell>
        <Badge variant="outline">{tuple.namespace}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">{tuple.object}</TableCell>
      <TableCell className="text-muted-foreground">{tuple.relation}</TableCell>
      <TableCell className="font-mono text-xs">{subject}</TableCell>
      <TableCell>
        {tuple.subject_id ? (
          <form action={deleteRelationTupleAction}>
            <input name="namespace" type="hidden" value={tuple.namespace} />
            <input name="object" type="hidden" value={tuple.object} />
            <input name="relation" type="hidden" value={tuple.relation} />
            <ConfirmSubmitButton
              description={`This deletes the ${tuple.namespace}:${tuple.object}#${tuple.relation}@${subject} tuple from Keto. Whatever access it granted is revoked immediately.`}
              name="subject_id"
              title="Delete this relation tuple?"
              value={tuple.subject_id}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const query = {
    namespace: params.check_namespace?.trim() ?? "",
    object: params.check_object?.trim() ?? "",
    relation: params.check_relation?.trim() ?? "",
    subject: params.check_subject?.trim() ?? "",
  };
  const hasQuery = Boolean(
    query.namespace && query.object && query.relation && query.subject,
  );
  const listNamespace = params.namespace?.trim() ?? "";
  const search = params.q?.trim().toLowerCase();

  const [fetched, allowed] = await Promise.all([
    listRelationTuples(listNamespace || undefined),
    hasQuery ? checkPermission(query) : Promise.resolve(null),
  ]);
  // Keto's ListRelationTuples supports a namespace filter server-side but
  // has no substring search over object/subject — that part is applied
  // client-side over the already-fetched, already-namespace-filtered page.
  const tuples = search
    ? fetched.filter(
        (t) =>
          t.object.toLowerCase().includes(search) ||
          formatSubject(t).toLowerCase().includes(search) ||
          t.relation.toLowerCase().includes(search),
      )
    : fetched;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Keto relation tuples and permission checks. Create/Delete call platform/console-api, which owns the Keto Admin API mutation — most tuples are still written by domain services as side effects (see platform/hooks), this form is for direct grants."
        title="Permissions"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Create relation tuple</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={createRelationTupleAction}
            className="grid grid-cols-2 gap-4 lg:grid-cols-5 lg:items-end"
          >
            <Field>
              <FieldLabel htmlFor="namespace">Namespace</FieldLabel>
              <Select defaultValue={KETO_NAMESPACES[0]} id="namespace" name="namespace">
                {KETO_NAMESPACES.map((namespace) => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="object">Object</FieldLabel>
              <Input id="object" name="object" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="relation">Relation</FieldLabel>
              <Input id="relation" name="relation" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="subject_id">Subject</FieldLabel>
              <Input id="subject_id" name="subject_id" required />
            </Field>
            <Button type="submit">Grant</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Check</CardTitle>
          <p className="text-muted-foreground text-sm">
            Would this subject be allowed? e.g. Element / beam-42 / edit /
            marius.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" method="GET">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="check_namespace">Namespace</FieldLabel>
                <Select
                  defaultValue={query.namespace || KETO_NAMESPACES[0]}
                  id="check_namespace"
                  name="check_namespace"
                >
                  {KETO_NAMESPACES.map((namespace) => (
                    <option key={namespace} value={namespace}>
                      {namespace}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="check_object">Object</FieldLabel>
                <Input defaultValue={query.object} id="check_object" name="check_object" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="check_relation">
                  Relation / permission
                </FieldLabel>
                <Input
                  defaultValue={query.relation}
                  id="check_relation"
                  name="check_relation"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="check_subject">Subject</FieldLabel>
                <Input defaultValue={query.subject} id="check_subject" name="check_subject" required />
              </Field>
            </div>
            <div className="flex items-center gap-4">
              <Button type="submit">Run check</Button>
              {hasQuery && allowed !== null ? (
                <Badge variant={allowed ? "outline" : "destructive"}>
                  {allowed ? "allowed" : "denied"}
                </Badge>
              ) : null}
              {hasQuery && allowed === null ? (
                <span className="text-destructive text-sm">
                  Check failed; is Keto running?
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-4" method="get">
            <Field>
              <FieldLabel htmlFor="namespace_filter">Namespace</FieldLabel>
              <Select className="w-auto" defaultValue={listNamespace} id="namespace_filter" name="namespace">
                <option value="">All</option>
                {KETO_NAMESPACES.map((namespace) => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="q">Search</FieldLabel>
              <Input defaultValue={params.q} id="q" name="q" placeholder="Object, relation, or subject" />
            </Field>
            <Button type="submit">Filter</Button>
            {listNamespace || params.q ? (
              <a className="text-muted-foreground text-sm underline" href="/auth/console/permissions">
                Clear
              </a>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-semibold text-base">Relation tuples</h2>
        {tuples.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {fetched.length === 0
              ? "No relation tuples in this namespace yet."
              : "No tuples match this search."}
          </p>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Object</TableHead>
                  <TableHead>Relation</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>{tuples.map(tupleRow)}</TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
