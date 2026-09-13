"use client";

import { STANDING_LABELS } from "@aec-craft/platform-sdk";
import { useMyStandings, useOrgs } from "@aec-craft/platform-sdk/react";
import { SectionLoading } from "@aec-craft/ui/components/blocks/section";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@aec-craft/ui/components/primitives/item";
import { ArrowRightIcon, BuildingOfficeIcon } from "@aec-craft/ui/icons";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { QueryError } from "@/components/query.error";
import { rootStanding } from "@/lib/standings";
import { CreateOrganizationDialog } from "./create.dialog";

/** A person belongs to a few organizations; one page holds them all. */
const PAGE_SIZE = 50;

/**
 * The tenancy as cards, the way the account settings beside it read: a person
 * belongs to a few and wants to open one. Each card says the slug and what the
 * reader holds there, from one read of every standing they have.
 */
export function OrganizationCards(): ReactNode {
  const orgs = useOrgs({ pageSize: PAGE_SIZE });
  const standings = useMyStandings();
  const [isCreating, setIsCreating] = useState(false);

  if (orgs.isPending) {
    return <SectionLoading />;
  }
  if (orgs.error) {
    return (
      <QueryError
        error={orgs.error}
        onRetry={() => void orgs.refetch()}
        subject="your organizations"
      />
    );
  }
  const standingOn = (orgId: string) =>
    rootStanding(
      (standings.data?.items ?? []).filter((item) => item.orgId === orgId)
    )?.standing ?? null;

  return (
    <div className="flex flex-col gap-4">
      {orgs.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          You do not belong to an organization yet.
        </p>
      ) : (
        <ItemGroup>
          {orgs.data.items.map((organization) => {
            const standing = standingOn(organization.id);
            return (
              <Item
                key={organization.id}
                render={<Link href={`/tenancy/${organization.id}`} />}
                variant="outline"
              >
                <BuildingOfficeIcon className="size-5 text-muted-foreground" />
                <ItemContent>
                  <ItemTitle>{organization.name}</ItemTitle>
                  <ItemDescription>{organization.slug}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  {standing ? (
                    <Badge variant="outline">{STANDING_LABELS[standing]}</Badge>
                  ) : null}
                  <ArrowRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <Button
        className="w-fit"
        onClick={() => setIsCreating(true)}
        size="sm"
        variant="outline"
      >
        Create organization
      </Button>
      <CreateOrganizationDialog
        onOpenChange={setIsCreating}
        open={isCreating}
      />
    </div>
  );
}
