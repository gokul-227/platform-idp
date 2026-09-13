"use client";

import { AvatarMenu } from "@aec-craft/ui/components/custom/avatar-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@aec-craft/ui/components/primitives/dropdown-menu";
import { SignOutIcon, UserCircleIcon } from "@aec-craft/ui/icons";
import type { ReactNode } from "react";

/**
 * Who is operating the console, and the way out. Signing out ends the session
 * shared with the sign-in app, which is the point: there is one session, and
 * leaving here leaves both.
 */
export function ConsoleUser({
  consoleUrl,
  email,
  idAppUrl,
  name,
  role,
}: {
  /** Where the sign-in app should return to, so its Back link has a target. */
  consoleUrl: string;
  email: string;
  idAppUrl: string;
  name: string;
  /** From `metadata_public`; the console admits nobody without one. */
  role: string;
}): ReactNode {
  return (
    <div className="flex items-center gap-3 px-1">
      <AvatarMenu align="start" email={email} name={name}>
        {/* Plain anchors: one is cross-app, the other side-effecting, so a
            client-side navigation is wrong for either. */}
        <DropdownMenuItem
          render={
            <a
              href={`${idAppUrl}/account?return_to=${encodeURIComponent(consoleUrl)}`}
            >
              <UserCircleIcon />
              Account
            </a>
          }
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <a href="/logout">
              <SignOutIcon />
              Sign out
            </a>
          }
        />
      </AvatarMenu>
      <div className="grid min-w-0 leading-tight">
        <span className="truncate text-[0.8125rem]">{name}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {role}
        </span>
      </div>
    </div>
  );
}
