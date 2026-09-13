import { redirect } from "next/navigation";
import { getSession } from "@/lib/kratos";

/**
 * The root is a router, not a screen: there is no sign-in-or-register
 * landing page. Signed in goes to account settings, everyone else to login,
 * which is the single entry point and links onward to registration.
 */
export default async function Page(): Promise<never> {
  const session = await getSession();
  redirect(session ? "/account" : "/login");
}
