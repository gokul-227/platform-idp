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
import type { ReactNode } from "react";
import { isPlatformAuthConfigured } from "@/lib/platform.auth";

/**
 * The way to the tenancy, not a copy of it.
 *
 * It used to list every organization here, which cost a member-count call each
 * and grew without bound — a card on a settings page that sometimes did not
 * finish loading. The list belongs on `/tenancy`, which owns it; this is one row
 * that goes there.
 *
 * Null where no platform client is registered, so the card disappears with it
 * rather than announcing a feature this deployment does not have.
 */
export function TenancySection(): ReactNode {
  if (!isPlatformAuthConfigured()) {
    return null;
  }
  return (
    <ItemGroup>
      <Item render={<Link href="/tenancy" />} variant="outline">
        <BuildingOfficeIcon className="size-5 text-muted-foreground" />
        <ItemContent>
          <ItemTitle>Organizations and projects</ItemTitle>
          <ItemDescription>
            Open what you belong to, its members and its projects.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ArrowRightIcon className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
    </ItemGroup>
  );
}
