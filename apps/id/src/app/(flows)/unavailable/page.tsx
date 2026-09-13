import { ErrorCard } from "@aec-craft/ui/components/blocks/error-page";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one flow failure minting another cannot fix, so it stops here instead of
 * redirecting. Named for the condition, not the cause: the same refusal covers a
 * link opened in a second browser, a stale tab, and cookies being dropped.
 */
export default function Page(): ReactNode {
  return (
    <ErrorCard
      action={
        <Link className={buttonVariants({ size: "sm" })} href="/login">
          Start again
        </Link>
      }
      description="This sign-in link cannot be used here."
      hint="It belongs to a sign-in started in another browser or tab, or this browser is not keeping cookies. Starting again in this one will work. If you came from an application, start again from there so it knows you signed in."
      title="Sign-in link not usable"
    />
  );
}
