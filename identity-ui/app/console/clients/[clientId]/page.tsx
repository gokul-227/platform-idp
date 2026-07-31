import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { hydraAdmin } from "@/adapters/admin";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import { PageHeader } from "../../page.header";
import {
  deleteClientDetailAction,
  rotateClientDetailSecretAction,
  updateClientDetailAction,
} from "./actions";

// The plain Hydra client editor — every field here maps straight to a real
// OAuth2Client field (confirmed against the SDK's own type), no business
// context attached. A client registered via registry/apps/*.yaml (an
// "Application" — sample apps, tenant-scoped, with real Users/Permissions/
// Roles tied to it) gets the richer /console/applications/<id> experience
// instead; this page is for everything else — a machine-to-machine client,
// an ad-hoc API integration, anything with no registry entry.
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { clientId } = await params;
  const query = await searchParams;
  const hydraClient = await hydraAdmin.getOAuth2Client({ id: clientId }).catch(() => null);

  if (!hydraClient) {
    notFound();
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader description={`Client ID: ${clientId}`} title={hydraClient.client_name || clientId} />

      {query.error ? <p className="text-destructive text-sm">{query.error}</p> : null}
      {query.saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}
      {query.secret ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">New client secret</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Shown once — Hydra does not return it again. Copy it now.
            </p>
            <code className="mt-2 block break-all rounded bg-muted px-2 py-1 text-xs">
              {query.secret}
            </code>
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">OAuth configuration</CardTitle>
          <p className="text-muted-foreground text-sm">
            Every field maps to a real Hydra client field — saving calls Hydra&apos;s real{" "}
            <code>PUT /admin/clients/{clientId}</code>.
          </p>
        </CardHeader>
        <CardContent>
          <form action={updateClientDetailAction} className="flex flex-col gap-4 text-sm">
            <input name="client_id" type="hidden" value={clientId} />
            <Field>
              <FieldLabel htmlFor="client_name">Client name</FieldLabel>
              <Input defaultValue={hydraClient.client_name} id="client_name" name="client_name" />
            </Field>
            <Field>
              <FieldLabel htmlFor="redirect_uris">Redirect URIs (comma-separated)</FieldLabel>
              <Input
                defaultValue={(hydraClient.redirect_uris ?? []).join(", ")}
                id="redirect_uris"
                name="redirect_uris"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="post_logout_redirect_uris">
                Post-logout redirect URIs (comma-separated)
              </FieldLabel>
              <Input
                defaultValue={(hydraClient.post_logout_redirect_uris ?? []).join(", ")}
                id="post_logout_redirect_uris"
                name="post_logout_redirect_uris"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="grant_types">Grant types (comma-separated)</FieldLabel>
              <Input
                defaultValue={(hydraClient.grant_types ?? []).join(", ")}
                id="grant_types"
                name="grant_types"
                placeholder="authorization_code, refresh_token, client_credentials"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="response_types">Response types (comma-separated)</FieldLabel>
              <Input
                defaultValue={(hydraClient.response_types ?? []).join(", ")}
                id="response_types"
                name="response_types"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scope">Scope</FieldLabel>
              <Input defaultValue={hydraClient.scope} id="scope" name="scope" />
            </Field>
            <Field>
              <FieldLabel htmlFor="token_endpoint_auth_method">Token endpoint auth method</FieldLabel>
              <Select
                className="w-auto"
                defaultValue={hydraClient.token_endpoint_auth_method}
                id="token_endpoint_auth_method"
                name="token_endpoint_auth_method"
              >
                <option value="client_secret_post">client_secret_post (confidential)</option>
                <option value="client_secret_basic">client_secret_basic (confidential)</option>
                <option value="none">none (public client)</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="jwks_uri">JWKS URI (for private_key_jwt clients)</FieldLabel>
              <Input
                defaultValue={hydraClient.jwks_uri ?? ""}
                id="jwks_uri"
                name="jwks_uri"
                placeholder="https://example.com/.well-known/jwks.json"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audience">Audience (comma-separated)</FieldLabel>
              <Input
                defaultValue={(hydraClient.audience ?? []).join(", ")}
                id="audience"
                name="audience"
                placeholder="https://api.example.com"
              />
            </Field>
            <p className="text-muted-foreground text-xs">
              No PKCE toggle: Hydra enforces PKCE automatically for public clients (token endpoint
              auth method &quot;none&quot;) using the authorization_code grant — there is no
              separate on/off field. No raw JWKS document upload here either — Hydra supports one,
              but this console only exposes a hosted JWKS URI for now.
            </p>

            <div className="border-t pt-4">
              <p className="mb-2 font-medium">Token configuration</p>
              <p className="mb-2 text-muted-foreground text-xs">
                Real per-client Hydra TTL overrides (e.g. <code>1h</code>, <code>24h</code>). Leave
                blank to use Hydra&apos;s global default.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="ac_access_ttl">Auth code grant — access token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.authorization_code_grant_access_token_lifespan ?? ""}
                    id="ac_access_ttl"
                    name="ac_access_ttl"
                    placeholder="e.g. 1h"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ac_id_ttl">Auth code grant — ID token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.authorization_code_grant_id_token_lifespan ?? ""}
                    id="ac_id_ttl"
                    name="ac_id_ttl"
                    placeholder="e.g. 1h"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ac_refresh_ttl">Auth code grant — refresh token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.authorization_code_grant_refresh_token_lifespan ?? ""}
                    id="ac_refresh_ttl"
                    name="ac_refresh_ttl"
                    placeholder="e.g. 720h"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cc_access_ttl">Client credentials grant — access token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.client_credentials_grant_access_token_lifespan ?? ""}
                    id="cc_access_ttl"
                    name="cc_access_ttl"
                    placeholder="e.g. 1h"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rt_access_ttl">Refresh grant — access token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.refresh_token_grant_access_token_lifespan ?? ""}
                    id="rt_access_ttl"
                    name="rt_access_ttl"
                    placeholder="e.g. 1h"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rt_id_ttl">Refresh grant — ID token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.refresh_token_grant_id_token_lifespan ?? ""}
                    id="rt_id_ttl"
                    name="rt_id_ttl"
                    placeholder="e.g. 1h"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rt_refresh_ttl">Refresh grant — refresh token TTL</FieldLabel>
                  <Input
                    defaultValue={hydraClient.refresh_token_grant_refresh_token_lifespan ?? ""}
                    id="rt_refresh_ttl"
                    name="rt_refresh_ttl"
                    placeholder="e.g. 720h"
                  />
                </Field>
              </div>
            </div>

            <Button className="w-fit" type="submit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <form action={rotateClientDetailSecretAction}>
            <input name="client_id" type="hidden" value={clientId} />
            <ConfirmSubmitButton
              description="The current client secret stops working immediately. Every real application using it must be updated with the new one before it can authenticate again."
              name="client_id"
              title="Rotate this client's secret?"
              value={clientId}
              variant="outline"
            >
              Rotate secret
            </ConfirmSubmitButton>
          </form>
          <form action={deleteClientDetailAction}>
            <input name="client_id" type="hidden" value={clientId} />
            <ConfirmSubmitButton
              description="This permanently deletes the OAuth2 client from Hydra. Any real application using it will immediately be unable to authenticate. This cannot be undone."
              name="client_id"
              title="Delete this client?"
              value={clientId}
            >
              Delete client
            </ConfirmSubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
