import { ErrorCard } from "@aec-craft/ui/components/blocks/error-page";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * What every `notFound()` in the console renders into. A server component, so
 * it takes no reset: there is nothing to retry, only somewhere else to go.
 */
export default function NotFound(): ReactNode {
  return (
    <div className="p-6">
      <ErrorCard
        action={
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href="/identities"
          >
            Back to identities
          </Link>
        }
        hint="It may have been deleted, or the address may be wrong. Nothing here confirms whether it ever existed."
        title="Not found"
      />
    </div>
  );
}
