import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { exchangeAuthorizationCode } from "@/adapters/developer";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { PageHeader } from "../../page.header";
import { refreshPlaygroundTokenAction } from "../actions";
import { OAUTH_PLAYGROUND_COOKIE } from "../oauth-playground.constants";

// Real Hydra Authorization Code + PKCE redirect target. The verifier and
// expected state never left the server (httpOnly cookie set in
// startAuthorizationCodeFlowAction) — this page only reads ?code/?state
// back from the real browser redirect Hydra just performed, matches state
// to defend against CSRF, and exchanges the code for real tokens.
export default async function DeveloperCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_PLAYGROUND_COOKIE)?.value;

  if (params.error) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Authorization Code + PKCE playground" title="Callback" />
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Hydra returned an error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm">
              {params.error}: {params.error_description}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!raw || !params.code) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Authorization Code + PKCE playground" title="Callback" />
        <Card className="gap-4">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              No pending flow found (cookie expired or this page was opened directly). Start a
              new flow from{" "}
              <a className="underline" href="/auth/console/developer">
                the Developer Portal
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pending = JSON.parse(raw) as {
    clientId: string;
    codeVerifier: string;
    redirectUri: string;
    state: string;
  };

  if (params.state !== pending.state) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Authorization Code + PKCE playground" title="Callback" />
        <Card className="gap-4">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">
              State mismatch — possible CSRF, or a stale flow. Start a new flow.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = await exchangeAuthorizationCode(
    pending.clientId, params.code, pending.redirectUri, pending.codeVerifier,
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Real tokens issued by Hydra's public /oauth2/token endpoint for this Authorization Code + PKCE exchange."
        title="Callback"
      />
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">
            {result.ok ? "Token exchange succeeded" : "Token exchange failed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {result.ok && result.tokens ? (
            <>
              <div>
                <p className="text-muted-foreground">Access token</p>
                <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                  {result.tokens.access_token}
                </code>
              </div>
              {result.tokens.refresh_token ? (
                <div>
                  <p className="text-muted-foreground">Refresh token</p>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                    {result.tokens.refresh_token}
                  </code>
                </div>
              ) : null}
              {result.tokens.id_token ? (
                <div>
                  <p className="text-muted-foreground">ID token</p>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                    {result.tokens.id_token}
                  </code>
                </div>
              ) : null}
              {result.tokens.refresh_token ? (
                <form
                  action={refreshPlaygroundTokenAction}
                  className="flex flex-wrap items-end gap-4 border-t pt-4"
                >
                  <input name="client_id" type="hidden" value={pending.clientId} />
                  <Field>
                    <FieldLabel htmlFor="refresh_token">Refresh token</FieldLabel>
                    <Input
                      defaultValue={result.tokens.refresh_token}
                      id="refresh_token"
                      name="refresh_token"
                    />
                  </Field>
                  <Button size="sm" type="submit">
                    Exchange for a new access token
                  </Button>
                </form>
              ) : null}
            </>
          ) : (
            <p className="text-destructive">{result.error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
