import type { GuardRefusalCode } from "@aec-craft/platform-id-contracts/guard/guard.denials";
import { ErrorPage } from "@aec-craft/ui/components/blocks/error-page";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import type { ReactNode } from "react";

/**
 * Why the gate refused, for the cases no auth flow can resolve. Outside the gate,
 * because it must answer without a session and must never redirect into a flow.
 *
 * Nothing here says how access is granted or what was checked: a visitor who
 * cannot get in is a stranger, and each of those is a hint. A missing second
 * factor never reaches here, the guard sending that session to step-up instead.
 */
interface Refusal {
  action?: { href: string; label: string };
  hint: string;
  title: string;
}

const NO_ACCESS: Refusal = {
  action: { href: "/logout", label: "Sign in with another account" },
  hint: "Ask someone who already has console access to grant it, then sign in again.",
  title: "You do not have access",
};

/**
 * `satisfies` binds the keys to the guard's public vocabulary, so copy for a
 * code it does not emit is a type error, while the lookup below stays open to
 * whatever a URL actually carries.
 */
const REFUSALS = {
  "no-access": NO_ACCESS,
  unavailable: {
    hint: "Something on our side is not responding, so nothing could be checked. Try again shortly.",
    title: "Cannot verify your session",
  },
} satisfies Record<GuardRefusalCode, Refusal>;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}): Promise<ReactNode> {
  const { code } = await searchParams;
  // An unrecognised code lands on the least revealing of the two, never on a
  // page that says the code was unrecognised.
  const detail: Refusal =
    (code ? REFUSALS[code as GuardRefusalCode] : undefined) ?? NO_ACCESS;
  const action = detail.action;

  return (
    <ErrorPage
      hint={detail.hint}
      title={detail.title}
      {...(action
        ? {
            action: (
              // Plain anchor: cross-app, or a route handler with a side effect.
              <a className={buttonVariants({ size: "sm" })} href={action.href}>
                {action.label}
              </a>
            ),
          }
        : {})}
    />
  );
}
