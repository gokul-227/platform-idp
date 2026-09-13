import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import { TableCell, TableRow } from "@aec-craft/ui/components/primitives/table";
import { CheckIcon, MinusIcon } from "@aec-craft/ui/icons";
import type { OAuth2Client } from "@ory/client-fetch";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConsoleTable } from "@/components/console.table";
import { PageHeader } from "@/components/page.header";
import { hydraAdmin } from "@/lib/hydra";
import { PAGE_PARAM, PAGE_SIZE, readPage, readTrail } from "@/lib/pagination";
import { ApplicationMenu } from "./application.menu";

/**
 * Hydra filters `client_name` and `owner`, both exact, and sorts nothing.
 * The other columns carry no controls rather than filtering a partial page.
 */
const COLUMNS = [
  {
    filter: { placeholder: "Exact name…", type: "search" },
    key: "name",
    label: "Name",
  },
  { label: "Client ID" },
  { label: "Type" },
  { label: "Consent" },
  {
    filter: { placeholder: "Exact org id…", type: "search" },
    key: "owner",
    label: "Owner",
  },
  { label: "Created" },
  // No header: the column is one control per row, and a word above it would
  // name the menu rather than what the column holds.
  { className: "w-0", label: "" },
] as const;

function applicationRow(client: OAuth2Client): ReactNode {
  const isPublic = client.token_endpoint_auth_method === "none";
  return (
    <TableRow key={client.client_id}>
      <TableCell>
        <Link
          className="hover:underline"
          href={`/applications/${client.client_id}`}
        >
          {client.client_name || "unnamed"}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-xs">{client.client_id}</TableCell>
      <TableCell>
        <Badge variant="outline">{isPublic ? "public" : "confidential"}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {/* The column asks "does this client prompt for consent", so the icon
            answers that question rather than restating the field name: a check
            means it prompts. Reading the row as words made every line the same
            length and the exceptions impossible to spot down a column. */}
        {client.skip_consent ? (
          <MinusIcon aria-label="skipped" className="size-4 opacity-40" />
        ) : (
          <CheckIcon aria-label="required" className="size-4" />
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {client.owner || "platform"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(client.created_at)}
      </TableCell>
      <TableCell>
        <ApplicationMenu
          id={client.client_id ?? ""}
          name={client.client_name || null}
        />
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
  const name = params.name?.trim();
  const owner = params.owner?.trim();
  const pageToken = readTrail(params[PAGE_PARAM]).at(-1);

  const page = await readPage(
    hydraAdmin.listOAuth2ClientsRaw({
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
      ...(name ? { clientName: name } : {}),
      ...(owner ? { owner } : {}),
    })
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        actions={
          <Link className={buttonVariants()} href="/applications/new">
            New application
          </Link>
        }
        description="Everything that can ask someone to sign in. Each one is added here; nothing registers itself."
        title="Applications"
      />
      <ConsoleTable
        columns={COLUMNS}
        empty={
          name || owner
            ? "No match. Hydra compares the whole name and the whole owner id, not a fragment."
            : "No applications yet."
        }
        nextToken={page.nextToken}
      >
        {page.items.map(applicationRow)}
      </ConsoleTable>
    </div>
  );
}
