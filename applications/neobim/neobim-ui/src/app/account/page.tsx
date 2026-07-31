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

// Same Card shell as platform-neobim/apps/auth's own /account page reference
// (mentioned in ui-neobim/packages/ui's block comments) — this is the
// landing page a user reaches after a real Ory login completes.
export default async function AccountPage(): Promise<React.ReactNode> {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-8">
        <CardHeader>
          <CardTitle className="text-base">Signed in</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{session.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{session.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="truncate font-mono text-xs">{session.sub}</dd>
            </dl>
            <a
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              href="/auth/logout"
            >
              Log out
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
