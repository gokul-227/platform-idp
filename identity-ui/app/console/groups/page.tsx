import Link from "next/link";
import type { ReactNode } from "react";

import { formatSubject, listRelationTuples, type RelationTuple } from "@/adapters/admin";
import { listTenants, type Tenant } from "@/adapters/tenant-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import { PageHeader } from "../page.header";
import {
  addGroupRelationAction,
  removeGroupParentAction,
  removeGroupRelationAction,
  setGroupParentAction,
} from "./actions";

const GROUP_RELATIONS = ["member", "manager"] as const;

function relationRow(teamId: string, tuple: RelationTuple): ReactNode {
  const subject = formatSubject(tuple);
  return (
    <div
      className="flex items-center justify-between gap-2 text-sm"
      key={`${tuple.relation}@${subject}`}
    >
      <span className="flex items-center gap-2">
        <Badge variant="outline">{tuple.relation}</Badge>
        <span className="font-mono text-xs">{subject}</span>
      </span>
      <form action={removeGroupRelationAction}>
        <input name="team_id" type="hidden" value={teamId} />
        <input name="relation" type="hidden" value={tuple.relation} />
        <ConfirmSubmitButton
          description={`This removes the ${tuple.relation} relation for ${subject} on group ${teamId} — they lose any access this group inherits (e.g. from a linked parent organization).`}
          name="subject_id"
          title="Remove this relation?"
          value={subject}
        >
          Remove
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

function groupCard(teamId: string, tuples: RelationTuple[], tenants: Tenant[]): ReactNode {
  const memberTuples = tuples.filter((t) => t.relation !== "parent");
  const parentTuple = tuples.find((t) => t.relation === "parent" && t.subject_set);
  const parentTenant = parentTuple
    ? tenants.find((t) => t.id === parentTuple.subject_set?.object)
    : undefined;

  return (
    <Card className="gap-4" key={teamId}>
      <CardHeader>
        <CardTitle className="font-mono text-sm">{teamId}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 border-b pb-4 text-sm">
          <span className="text-muted-foreground">
            Parent organization:{" "}
            {parentTenant ? (
              <span className="font-medium text-foreground">{parentTenant.name}</span>
            ) : (
              "none"
            )}
          </span>
          {parentTuple && parentTuple.subject_set ? (
            <form action={removeGroupParentAction}>
              <input name="team_id" type="hidden" value={teamId} />
              <ConfirmSubmitButton
                description={`This removes the group's link to ${parentTenant?.name ?? parentTuple.subject_set.object} — its members stop inheriting that organization's admin access.`}
                name="organization_id"
                title="Unlink this organization?"
                value={parentTuple.subject_set.object}
              >
                Unlink
              </ConfirmSubmitButton>
            </form>
          ) : (
            <form action={setGroupParentAction} className="flex items-end gap-2">
              <input name="team_id" type="hidden" value={teamId} />
              <Select className="w-auto" defaultValue="" name="organization_id">
                <option disabled value="">
                  Select organization
                </option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" type="submit" variant="outline">
                Link
              </Button>
            </form>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {memberTuples.map((tuple) => relationRow(teamId, tuple))}
        </div>
        <form
          action={addGroupRelationAction}
          className="flex flex-wrap items-end gap-2 border-t pt-4"
        >
          <input name="team_id" type="hidden" value={teamId} />
          <Field>
            <FieldLabel htmlFor={`subject-${teamId}`}>Identity ID</FieldLabel>
            <Input id={`subject-${teamId}`} name="subject_id" required />
          </Field>
          <Field>
            <FieldLabel htmlFor={`relation-${teamId}`}>Relation</FieldLabel>
            <Select defaultValue="member" id={`relation-${teamId}`} name="relation">
              {GROUP_RELATIONS.map((relation) => (
                <option key={relation} value={relation}>
                  {relation}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" type="submit">
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Groups = Keto's Team namespace (ory/keto/namespaces/namespaces.ts:
// related.manager / related.member, both User) — reused directly, not
// reinvented, same way Organizations reuses Keto's Organization namespace.
// Unlike Organizations there is no Postgres-backed entity for a team's
// name/metadata (Keto only stores relation tuples) — a "group" exists the
// moment any manager/member tuple references its object id, and this page
// lists exactly the distinct team ids found that way. Team.parent (linking
// a team to an Organization) is a real subject_set relation, not a plain
// subject_id — Link/Unlink write and delete that subject_set tuple
// directly, giving the team's members real Organization-admin inheritance
// via namespaces.ts's `traverse` calls (Keto authorizes on this the moment
// the tuple exists — no separate "apply" step).
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase();
  const [tuples, tenants] = await Promise.all([listRelationTuples("Team"), listTenants()]);
  const byTeam = new Map<string, RelationTuple[]>();
  for (const tuple of tuples) {
    const list = byTeam.get(tuple.object) ?? [];
    list.push(tuple);
    byTeam.set(tuple.object, list);
  }
  // Keto has no server-side search over Team objects (it only stores
  // relation tuples, no queryable metadata) — this filters by team ID or
  // a member/manager's subject id, over the already-fetched tuple set.
  const entries = Array.from(byTeam.entries()).filter(([teamId, teamTuples]) => {
    if (!query) return true;
    if (teamId.toLowerCase().includes(query)) return true;
    return teamTuples.some((t) => formatSubject(t).toLowerCase().includes(query));
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Groups are Keto's Team namespace (manager/member relations). Create a group by adding its first member below with a new Team ID — add/remove both call platform/console-api's relation-tuple endpoints, the same ones Permissions and Organizations use."
        title="Groups"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Create group</CardTitle>
          <p className="text-muted-foreground text-sm">
            Pick a new Team ID and add its first member or manager — the
            group exists as soon as this tuple is written.
          </p>
        </CardHeader>
        <CardContent>
          <form
            action={addGroupRelationAction}
            className="flex flex-wrap items-end gap-4"
          >
            <Field>
              <FieldLabel htmlFor="new-team-id">Team ID</FieldLabel>
              <Input id="new-team-id" name="team_id" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-subject-id">Identity ID</FieldLabel>
              <Input id="new-subject-id" name="subject_id" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-relation">Relation</FieldLabel>
              <Select defaultValue="manager" id="new-relation" name="relation">
                {GROUP_RELATIONS.map((relation) => (
                  <option key={relation} value={relation}>
                    {relation}
                  </option>
                ))}
              </Select>
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
              <Input defaultValue={query} id="q" name="q" placeholder="Team ID or member identity ID" />
            </Field>
            <Button type="submit">Search</Button>
            {query ? (
              <Link className="text-muted-foreground text-sm underline" href="/console/groups">
                Clear
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {byTeam.size === 0 ? (
        <p className="text-muted-foreground text-sm">No groups yet.</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No groups match this search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {entries.map(([teamId, teamTuples]) => groupCard(teamId, teamTuples, tenants))}
        </div>
      )}
    </div>
  );
}
