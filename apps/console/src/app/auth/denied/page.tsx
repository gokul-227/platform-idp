import { ErrorCard } from "@aec-craft/ui/components/blocks/error-page";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Where the platform round trip lands when the issuer refuses it. Without this
 * the failure 404s, which reads as a broken link rather than a refused
 * authorization — and the reason is only in a query parameter nobody sees.
 *
 * The reason is shown because every one of them is an operator's to fix: an
 * audience the client is not registered for, a redirect URI that does not
 * match, a client that no longer exists. None is anything the person at the
 * screen did.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}): Promise<ReactNode> {
  const { error, error_description: description } = await searchParams;
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-6">
      <ErrorCard
        action={
          <Link className={buttonVariants({ size: "sm" })} href="/tenancy">
            Back to organizations
          </Link>
        }
        description="This console could not obtain access to the platform API."
        hint={
          description ??
          (error
            ? `The issuer refused the request: ${error}.`
            : "The issuer refused the request without saying why.")
        }
        title="Platform access refused"
      />
    </div>
  );
}
