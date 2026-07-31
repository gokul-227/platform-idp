import Link from "next/link";
import type { ReactNode } from "react";

import { identityAdmin } from "@/adapters/admin";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import { PageHeader } from "../page.header";
import { createIdentityAction } from "./actions";
import { IdentitiesTable } from "./identities-table";

// Real CRUD, backed by platform/console-api (never Kratos directly from
// here — see that service's README). The flat list here is create/search/
// filter/enable/disable/delete; per-identity depth (traits, sessions,
// credentials, devices, memberships, roles, security timeline) lives on
// the detail page at /console/identities/<id> — see that page.
//
// The table itself lives in ./identities-table.tsx (a Client Component):
// DataTable's column definitions carry render/sort functions, which React
// cannot serialize across the Server -> Client Component boundary — this
// page tried passing them directly as props before, which threw a real
// live 500 ("Functions cannot be passed directly to Client Components").
export default async function IdentitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const email = params.email?.trim();
  const stateFilter = params.state;
  const verifiedFilter = params.verified;
  const fetched = await identityAdmin.listIdentities({
    pageSize: 250,
    ...(email ? { previewCredentialsIdentifierSimilar: email } : {}),
  });
  // Kratos's Admin API has no server-side state/verified filter (confirmed
  // against the SDK's own ListIdentitiesRequest — only credentialsIdentifier/
  // previewCredentialsIdentifierSimilar/ids/organizationId exist), so these
  // two stay applied server-side-in-this-Server-Component over the
  // already-fetched page, same as before. The DataTable inside
  // IdentitiesTable adds client-side instant search/sort/pagination on top
  // of this already-filtered result set — it does not replace these real
  // filters.
  const identities = fetched.filter((identity) => {
    if (stateFilter && identity.state !== stateFilter) return false;
    if (verifiedFilter) {
      const isVerified = (identity.verifiable_addresses ?? []).some((a) => a.verified);
      if (verifiedFilter === "verified" && !isVerified) return false;
      if (verifiedFilter === "unverified" && isVerified) return false;
    }
    return true;
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Kratos identities in this platform. Create/Enable/Disable/Delete call platform/console-api, which owns the Kratos Admin API mutation."
        title="Identities"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Create identity</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createIdentityAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" required type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password (optional)</FieldLabel>
              <Input id="password" name="password" type="password" />
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" method="get">
            <Field>
              <FieldLabel htmlFor="email">Email contains</FieldLabel>
              <Input defaultValue={email} id="email" name="email" placeholder="e.g. acme.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="state">State</FieldLabel>
              <Select className="w-auto" defaultValue={stateFilter ?? ""} id="state" name="state">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="verified">Verified</FieldLabel>
              <Select className="w-auto" defaultValue={verifiedFilter ?? ""} id="verified" name="verified">
                <option value="">All</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </Select>
            </Field>
            <Button type="submit">Filter</Button>
            {email || stateFilter || verifiedFilter ? (
              <Link className="text-muted-foreground text-sm underline" href="/console/identities">
                Clear
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="w-full min-w-0 gap-4">
        <CardHeader>
          <CardTitle className="text-base">
            {identities.length} identit{identities.length === 1 ? "y" : "ies"}
          </CardTitle>
        </CardHeader>
        <CardContent className="w-full min-w-0">
          <IdentitiesTable
            emptyMessage={
              fetched.length === 0
                ? "No identities yet — register one at /registration."
                : "No identities match these filters."
            }
            identities={identities}
          />
        </CardContent>
      </Card>
    </div>
  );
}
