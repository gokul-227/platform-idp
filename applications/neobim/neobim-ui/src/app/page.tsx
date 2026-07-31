import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Layout/markup structure copied from
// platform-neobim/apps/auth/src/app/(auth)/login/page.tsx — same Card shell,
// same design-system components. The OTP/Google/Microsoft/SSO forms are
// replaced with a single link to /auth/login, which redirects to this
// platform's existing Ory Hydra + Kratos login (the same mechanism already
// used by Mealie/Open WebUI/Superset/Airflow) — no NeoBIM auth backend is
// deployed here.
export default async function Page(): Promise<React.ReactNode> {
  const session = await getSession();
  if (session) {
    redirect("/account");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-8">
        <CardHeader>
          <CardTitle className="text-base">Welcome to NeoBIM</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <p className="text-muted-foreground text-sm">
              Sign in with your Identity Platform account — the same account
              used for Mealie, Open WebUI, Superset, and Airflow.
            </p>
            <a
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
              href="/auth/login"
            >
              Sign in with Identity Platform
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
