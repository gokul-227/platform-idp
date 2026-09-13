"use client";

import { AvatarMenu } from "@aec-craft/ui/components/custom/avatar-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import {
  BuildingOfficeIcon,
  SignOutIcon,
  UserCircleIcon,
} from "@aec-craft/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Who is signed in, and the way between the two sections they own.
 *
 * It was a Sign out button beside the wordmark and a "Back to account settings"
 * link on every tenancy page — two affordances for one idea, and the back link
 * only ever pointed one way. The menu names the section you are not in, so
 * moving between them is the same gesture wherever you are.
 */
export function SectionMenu({
  email,
  name,
  picture,
}: {
  email?: string | null;
  name?: string | null;
  picture?: string | null;
}): ReactNode {
  const pathname = usePathname();
  const isTenancy = pathname.startsWith("/tenancy");

  return (
    <AvatarMenu align="end" email={email} name={name} picture={picture}>
      {isTenancy ? (
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserCircleIcon />
          Account
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem render={<Link href="/tenancy" />}>
          <BuildingOfficeIcon />
          Organizations and projects
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {/* Plain <a>: a route handler with side effects wants no prefetch. */}
      <DropdownMenuItem
        render={
          <a href="/logout">
            <SignOutIcon />
            Sign out
          </a>
        }
      />
    </AvatarMenu>
  );
}
