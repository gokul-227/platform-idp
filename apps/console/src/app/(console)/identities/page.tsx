import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import {
  authorityOf,
  displayNameOf,
  traitsOf,
} from "@aec-craft/platform-id-sdk/identity";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import type { Identity } from "@ory/client-fetch";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConsoleTable } from "@/components/console.table";
import { PageHeader } from "@/components/page.header";
import { AUTHORITY_LABELS, NO_AUTHORITY_LABEL } from "@/lib/authority";
import { identityAdmin } from "@/lib/kratos.admin";
import { PAGE_PARAM, PAGE_SIZE, readPage, readTrail } from "@/lib/pagination";
import { configuredRoots } from "@/lib/roots";
import { type Actor, getActor } from "@/lib/staff";
import { IDENTITY_STATE_BADGE } from "@/lib/status.badge";
import { IdentityMenu } from "./identity.menu";

/**
 * Only the email column filters, because it is the only thing Kratos can
 * narrow: `preview_credentials_identifier_similar` prefix-matches the
 * credential identifier. There is no server-side filter for name, state,
 * verification or creation date, and no sort of any kind, so those columns
 * carry no controls rather than sorting a partial page.
 */
const COLUMNS = [
  {
    filter: { placeholder: "Email starts with…", type: "search" },
    key: "email",
    label: "Email",
  },
  { label: "Name" },
  { label: "Access" },
  { label: "State" },
  { label: "Verified" },
  { label: "Created" },
  // No header: the column is one control per row, and a word above it would
  // name the menu rather than what the column holds.
  { className: "w-0", label: "" },
] as const;

function identityRow(identity: Identity, actor: Actor | null): ReactNode {
  const traits = traitsOf(identity);
  // Derived, so the row agrees with the detail page and the guard: a root holds
  // no stored role, and reading that showed them as having no access at all.
  const roots = configuredRoots();
  const authority = authorityOf(identity, roots);
  const state =
    identity.state === "active"
      ? IDENTITY_STATE_BADGE.active
      : IDENTITY_STATE_BADGE.inactive;
  const isVerified = (identity.verifiable_addresses ?? []).some(
    (address) => address.verified
  );
  return (
    <TableRow key={identity.id}>
      <TableCell>
        <Link className="hover:underline" href={`/identities/${identity.id}`}>
          {traits.email ?? identity.id}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {displayNameOf(identity)}
      </TableCell>
      <TableCell>
        {authority ? (
          // The badge carries the reason rather than a word beside it repeating
          // the label: the row said "Rootroot", which reads as a rendering bug.
          <Badge
            title={
              authority === "root"
                ? "Configured in ROOT_EMAILS. Root itself cannot be granted or revoked here; the platform needs Administrator written on the account as well."
                : undefined
            }
            variant={authority === "root" ? "default" : "outline"}
          >
            {AUTHORITY_LABELS[authority]}
          </Badge>
        ) : (
          // Quiet, because it is the common case and the exceptions are what a
          // reader is scanning for.
          <Badge className="text-muted-foreground" variant="outline">
            {NO_AUTHORITY_LABEL}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge {...state}>{state.label}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {isVerified ? "verified" : "unverified"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(identity.created_at)}
      </TableCell>
      <TableCell>
        {actor ? (
          <IdentityMenu
            actorAuthority={actor.authority}
            authority={authority}
            email={traits.email}
            id={identity.id}
            isActive={identity.state === "active"}
          />
        ) : (
          // The menu's own height, held open, so the rows stay the same height.
          <div aria-hidden="true" className="size-9" />
        )}
      </TableCell>
    </TableRow>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const email = params.email?.trim();
  // Once for the page rather than per row: every row asks the same two things
  // of it, and it is a session read.
  const actor = await getActor();
  const pageToken = readTrail(params[PAGE_PARAM]).at(-1);

  const page = await readPage(
    identityAdmin.listIdentitiesRaw({
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
      ...(email ? { previewCredentialsIdentifierSimilar: email } : {}),
    })
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        actions={
          <Link className={buttonVariants()} href="/identities/new">
            New identity
          </Link>
        }
        description="Every account, and what each one opens."
        title="Identities"
      />
      <ConsoleTable
        columns={COLUMNS}
        empty={
          email
            ? `No identity's email starts with "${email}".`
            : "No identities yet."
        }
        nextToken={page.nextToken}
      >
        {page.items.map((identity) => identityRow(identity, actor))}
      </ConsoleTable>
    </div>
  );
}
