import { BuildOsLockup } from "@aec-craft/ui/components/branding/buildos-lockup";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PlatformProviders } from "@/components/platform.providers";
import { SectionMenu } from "@/components/section.menu";
import { getSession } from "@/lib/kratos";

export const metadata: Metadata = { title: "buildOS tenancy" };

/**
 * The organizations and projects a person belongs to.
 *
 * Same shell as the other section, and the word beside the wordmark is the only
 * difference — a route group rather than a flag, because a server layout cannot
 * tell which child is rendering. The avatar carries the way between them.
 */
export default async function Layout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const identity = (await getSession())?.identity;
  const traits = (identity?.traits ?? {}) as {
    email?: string;
    name?: { first?: string; last?: string };
  };
  const name = [traits.name?.first, traits.name?.last]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2">
          <BuildOsLockup size={24} />
          <span className="font-medium text-[22px] text-muted-foreground leading-none tracking-tight">
            tenancy
          </span>
        </h1>
        <SectionMenu email={traits.email} name={name || null} />
      </header>
      <PlatformProviders>{children}</PlatformProviders>
    </main>
  );
}
