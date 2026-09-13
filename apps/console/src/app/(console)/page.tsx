import { redirect } from "next/navigation";

/**
 * The console has no home of its own, so `/` lands on the first surface.
 *
 * It held service-readiness cards for Kratos and Hydra. The Kratos one could
 * not fire: the layout resolves the session through Kratos, so a Kratos that is
 * down redirects to sign-in and the card is never rendered. The ports beside
 * each label were literals, and every deployed environment reaches both over
 * https with no port at all, so they were wrong everywhere but a laptop.
 */
export default function Page(): never {
  redirect("/identities");
}
