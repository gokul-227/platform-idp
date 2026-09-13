import { Skeleton } from "@aec-craft/ui/components/primitives/skeleton";
import type { ReactNode } from "react";

/**
 * Shown while an organization and the caller's standing in it resolve. Covers
 * every section beneath it, so Members, Security and Domains each get a frame
 * rather than a blank page while their own reads run.
 *
 * The nav strip is part of the skeleton on purpose: it is the same on every
 * section, so drawing it immediately makes moving between them feel like one
 * page rather than four separate loads.
 */
export default function Loading(): ReactNode {
  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-9 w-72 rounded-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <Skeleton className="h-24" key={card} />
        ))}
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}
