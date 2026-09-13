import { Header } from "@aec-craft/ui/components/blocks/header";
import type { ReactNode } from "react";
import { platformGate } from "@/lib/platform.user";
import { OrganizationCards } from "./organization.card";
import { PlatformUnavailable } from "./platform.unavailable";

/**
 * The organizations this person can reach, read from platform as them:
 * `GET /orgs` is bounded by what the caller can read, which resolves a standing
 * inherited from a group above and one granted to a subject set alike. Nothing
 * static: it is one person's estate, and a prerender would show it to the next.
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const gate = await platformGate("/tenancy", await searchParams);
  return (
    <div className="flex flex-col gap-6">
      {/* No back link: the avatar menu in the header moves between tenancy and
          account, so a second way out beside it said the same thing twice. */}
      <Header
        description="The organizations you belong to. Open one for its members and projects."
        title="Organizations"
      />
      {"unavailable" in gate ? (
        <PlatformUnavailable reason={gate.unavailable} />
      ) : (
        <OrganizationCards />
      )}
    </div>
  );
}
