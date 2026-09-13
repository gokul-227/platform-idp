import { ErrorCard } from "@aec-craft/ui/components/blocks/error-page";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getFlowErrorById } from "@/lib/kratos";

/**
 * Kratos hands over an error id, and what its API returns names the
 * misconfiguration rather than what to do about it, so the code is shown and the
 * hint says what the reader can act on.
 *
 * `reason` and `message` are not rendered: Kratos builds them from request-derived
 * values, so whoever crafts the flow chooses prose appearing on the branded
 * sign-in domain. Logged instead, for the operator they were written for.
 */
const HINTS: Record<string, string> = {
  security_csrf_violation:
    "The form was submitted from a different browser or tab than the one that opened it. Start again in a single tab.",
  security_identity_mismatch:
    "This flow belongs to a different session than the one in this browser. Sign out fully, then start again.",
  self_service_flow_expired:
    "The link or form had a time limit and it passed. Starting again will work.",
  self_service_flow_return_to_forbidden:
    "The address this flow was told to return to is not one the server allows. Start again from the app you meant to sign in to.",
  session_already_available:
    "You are already signed in, so there was nothing left to do.",
};

interface FlowErrorBody {
  id?: string;
  message?: string;
  reason?: string;
  status?: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const id = params.id;
  if (!id) {
    redirect("/login");
  }
  const flowError = await getFlowErrorById(id);
  const body = (flowError?.error ?? {}) as FlowErrorBody;
  const code = body.id ?? body.status;
  const detail = body.reason ?? body.message;
  // The operator's half of this page. `id` is enough to find the flow again.
  if (detail) {
    console.warn(`flow error ${code ?? "unknown"} (${id}): ${detail}`);
  }
  // Absent for an unrecognised code, which is the case that would otherwise have
  // shown whatever the issuer was handed.
  const hint =
    (code ? HINTS[code] : undefined) ??
    "Starting again usually clears it. If it keeps happening, the code above is what to quote.";

  return (
    <ErrorCard
      action={
        <Link className={buttonVariants({ size: "sm" })} href="/login">
          Back to sign-in
        </Link>
      }
      description="This sign-in attempt could not be completed."
      title="Something went wrong"
      {...(code ? { code } : {})}
      hint={hint}
    />
  );
}
