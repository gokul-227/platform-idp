import type { Session } from "@ory/client-fetch";
import Link from "next/link";
import type { ReactNode } from "react";

import { identityAdmin, identityTraits } from "@/adapters/admin";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent } from "@/components/vendor/ui/card";
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
import { revokeAllSessionsAction, revokeSessionAction } from "./actions";

function formatDate(value?: Date): string {
  if (!value) return "";
  return value.toISOString().replace("T", " ").slice(0, 16);
}

function sessionRow(session: Session): ReactNode {
  const identity = session.identity;
  const email = identity ? identityTraits(identity).email : undefined;
  return (
    <TableRow key={session.id}>
      <TableCell>
        {identity ? (
          <Link
            className="hover:underline"
            href={`/console/identities/${identity.id}`}
          >
            {email ?? identity.id}
          </Link>
        ) : (
          <span className="text-muted-foreground">unknown</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={session.active ? "outline" : "secondary"}>
          {session.active ? "active" : "inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {session.authenticator_assurance_level}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {(session.authentication_methods ?? [])
          .map((method) => method.method)
          .join(", ")}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(session.authenticated_at)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(session.expires_at)}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <form action={revokeSessionAction}>
            <ConfirmSubmitButton
              description="This immediately signs this device out — it must re-authenticate to use the session again."
              disabled={!session.active}
              name="id"
              title="Revoke this session?"
              value={session.id}
            >
              Revoke
            </ConfirmSubmitButton>
          </form>
          {identity ? (
            <form action={revokeAllSessionsAction}>
              <ConfirmSubmitButton
                description={`This immediately signs ${email ?? identity.id} out of every device and browser they're currently logged into.`}
                name="identity_id"
                title="Revoke all sessions for this identity?"
                value={identity.id}
                variant="outline"
              >
                Revoke all for identity
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

// Revoke calls platform/console-api (DELETE /api/v1/sessions/{id} and
// DELETE /api/v1/identities/{id}/sessions) — same Kratos Admin API
// mutation pattern console/identities already proved out. Safe now that
// /console/* is gated by middleware.ts + a real platform-admin check.
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const active = params.active;
  const email = params.email?.trim().toLowerCase();
  const fetched = await identityAdmin.listSessions({
    expand: ["identity"],
    pageSize: 250,
    ...(active === "true" || active === "false"
      ? { active: active === "true" }
      : {}),
  });
  // Kratos's Admin API has no server-side identity/email filter on
  // /admin/sessions (only `active` — confirmed against the SDK's
  // ListSessionsRequest), so email is filtered client-side over the
  // already-fetched, already-expanded page.
  const sessions = email
    ? fetched.filter((s) =>
        (s.identity ? identityTraits(s.identity).email ?? "" : "").toLowerCase().includes(email),
      )
    : fetched;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Sessions across all identities. Revoke calls platform/console-api, which owns the Kratos Admin API mutation. Kratos's bulk sessions endpoint never returns device records (IP address/user agent) — confirmed against the live Admin API response; only the per-identity endpoint on each identity's own detail page includes them. This is a real Ory OSS API limitation, not a gap in this console."
        title="Sessions"
      />

      <Card className="gap-4">
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-4" method="get">
            <Field>
              <FieldLabel htmlFor="email">Identity email contains</FieldLabel>
              <Input defaultValue={params.email} id="email" name="email" placeholder="e.g. acme.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="active">State</FieldLabel>
              <Select className="w-auto" defaultValue={active ?? ""} id="active" name="active">
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </Field>
            <Button type="submit">Filter</Button>
            {params.email || active ? (
              <a className="text-muted-foreground text-sm underline" href="/auth/console/sessions">
                Clear
              </a>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {fetched.length === 0 ? "No sessions." : "No sessions match these filters."}
        </p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identity</TableHead>
                <TableHead>State</TableHead>
                <TableHead>AAL</TableHead>
                <TableHead>Methods</TableHead>
                <TableHead>Authenticated</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>{sessions.map(sessionRow)}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
