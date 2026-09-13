import { Badge } from "@aec-craft/ui/components/primitives/badge";
import { buttonVariants } from "@aec-craft/ui/components/primitives/button";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";

/**
 * Always fresh: the gate may have renewed the token on this very request, and a
 * cached page would show the previous one.
 */
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4 border-rule border-b py-3 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <code className="max-w-96 truncate text-sm">{value}</code>
    </div>
  );
}

/** Hydra writes `scp` as an array; `String()` on it would join with commas. */
function scopeOf(claims: Record<string, unknown>): string {
  const scope = claims.scp ?? claims.scope;
  if (Array.isArray(scope)) {
    return scope.join(" ");
  }
  return typeof scope === "string" && scope.length > 0 ? scope : "none";
}

function expiresIn(expiresAt: number | null): string {
  if (!expiresAt) {
    return "unknown";
  }
  const seconds = expiresAt - Math.floor(Date.now() / 1000);
  return seconds > 0 ? `${seconds}s` : "expired";
}

export default async function Page(): Promise<ReactNode> {
  const session = await auth.getSession();
  const claims = session?.claims ?? {};

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-medium text-xl">
          Signed in through buildOS ID
          <Badge className="ml-3 align-middle" variant="outline">
            OAuth
          </Badge>
        </h1>
        <p className="text-muted-foreground text-sm">
          This app is a registered OAuth client. It holds a client id and
          secret, its redirect URI is validated by the issuer against its own
          client record, and nothing in the identity service's configuration
          mentions it. Adding an app is a console action.
        </p>
      </header>

      <section className="flex flex-col">
        <Row label="Subject" value={session?.subject ?? "unknown"} />
        <Row label="Email" value={session?.email ?? "not in the token"} />
        <Row label="Assurance" value={session?.aal ?? "not in the token"} />
        <Row label="Schema" value={session?.schema ?? "not in the token"} />
        <Row label="Staff role" value={session?.staffRole ?? "none"} />
        <Row label="Issuer" value={String(claims.iss ?? "unknown")} />
        <Row label="Client" value={String(claims.client_id ?? "unknown")} />
        <Row label="Scope" value={scopeOf(claims)} />
        <Row
          label="Access token expires in"
          value={expiresIn(session?.expiresAt ?? null)}
        />
      </section>

      <p className="text-muted-foreground text-sm">
        Everything below the subject arrives nested under an <code>ext</code>
        claim, because that is where Hydra puts whatever the consent step
        granted. The adapter unwraps it; a raw JWT decoder will not.
      </p>

      <p className="text-muted-foreground text-sm">
        The access token lives ten minutes. Wait past that and reload: the page
        still renders, because the gate spends the refresh token and writes a
        new one before this component runs. Nothing sends you back through
        sign-in.
      </p>

      {/* Plain anchor: a route handler with a side effect, ending cross-origin
          at the issuer. A <Link> prefetches, which would sign the visitor out. */}
      <a
        className={buttonVariants({ size: "sm", variant: "outline" })}
        href="/auth/logout"
      >
        Sign out
      </a>
    </main>
  );
}
