import {
  authorityOf,
  displayNameOf,
  emailOf,
} from "@aec-craft/platform-id-sdk/identity";
import { BuildOsLockup } from "@aec-craft/ui/components/branding/buildos-lockup";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@aec-craft/ui/components/primitives/sidebar";
import type { ReactNode } from "react";
import { ConsoleNav } from "@/components/console.nav";
import { ConsoleProviders } from "@/components/console.providers";
import { ConsoleUser } from "@/components/console.user";
import { AUTHORITY_LABELS } from "@/lib/authority";
import { env } from "@/lib/env";
import { configuredRoots } from "@/lib/roots";
import { getSession } from "@/lib/session";

/**
 * Nothing under here is static: every page reads a live admin API behind a
 * per-request session. Without this, a build tries to prerender them, and the
 * ones that swallow their own errors render as an empty estate rather than
 * failing, which is worse than a build error.
 */
export const dynamic = "force-dynamic";

/**
 * Operator surface over the Kratos and Hydra admin APIs, deployed apart from
 * the sign-in app so the internet-facing surface carries no admin URLs and no
 * network route to the admin ports.
 *
 * Every request here is gated by `proxy.ts`, so a rendered page always has a
 * staff session behind it; the footer reads that session to say whose it is.
 */
export default async function Layout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const session = await getSession();
  const identity = session?.identity;
  const operator = identity
    ? {
        email: emailOf(identity),
        name: displayNameOf(identity),
        // The effective role, which for the bootstrap staff is derived rather
        // than written: reading the stored value labelled the one account that
        // cannot be locked out as ordinary staff.
        role: AUTHORITY_LABELS[
          authorityOf(identity, configuredRoots()) ?? "staff"
        ],
      }
    : null;

  return (
    <ConsoleProviders>
      {/* The wrapper is min-h-svh by default and the inset adds m-2, so the page
          would be a viewport plus 1rem and the window would scroll. Pin the
          wrapper; the scroll belongs to the inset. */}
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <Sidebar variant="inset">
          {/* One line, centred: `items-baseline` put the word on the wordmark's
            bottom edge rather than beside it, because an SVG has no baseline to
            share. Set like the wordmark and only quieter, so the two read as one
            phrase rather than a name with a label stuck to it. */}
          <SidebarHeader className="flex-row items-center gap-2 px-4 py-4">
            <BuildOsLockup size={20} />
            <span className="font-medium text-[19px] text-muted-foreground leading-none tracking-tight">
              console
            </span>
          </SidebarHeader>
          <SidebarContent>
            <ConsoleNav />
          </SidebarContent>
          <SidebarFooter className="px-3 py-4">
            {operator ? (
              <ConsoleUser
                {...operator}
                consoleUrl={env.consoleUrl}
                idAppUrl={env.idAppUrl}
              />
            ) : null}
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0 overflow-y-auto">
          {children}
        </SidebarInset>
        {/*
        Small screens only, where the sidebar collapses and this is the way
        back to it. Floating at the bottom left rather than in the header: the
        top-left corner belongs to the title, and an inline trigger pushed it
        sideways on every page. Fixed, so it stays put while the body scrolls,
        and above the inset's own stacking context so nothing scrolls over it.
      */}
        <SidebarTrigger className="fixed bottom-4 left-4 z-30 size-10 rounded-full border border-rule bg-background/90 shadow-lg backdrop-blur md:hidden" />
      </SidebarProvider>
    </ConsoleProviders>
  );
}
