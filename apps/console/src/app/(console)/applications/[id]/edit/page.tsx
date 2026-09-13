import { Card, CardContent } from "@aec-craft/ui/components/primitives/card";
import type { OAuth2Client } from "@ory/client-fetch";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy.button";
import { DetailCard, DetailList, DetailRow } from "@/components/detail.list";
import { PageHeader } from "@/components/page.header";
import { hydraAdmin } from "@/lib/hydra";
import { ApplicationEditForm } from "./application.edit.form";
import { ApplicationSecretForm } from "./application.secret.form";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  let client: OAuth2Client | null = null;
  try {
    client = await hydraAdmin.getOAuth2Client({ id });
  } catch {
    client = null;
  }
  if (!client) {
    notFound();
  }

  const isPublic = client.token_endpoint_auth_method === "none";
  const name = client.client_name || "unnamed";

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        // Back to the application rather than the list: this page was reached
        // from it, and its list is one step further out.
        back={{ href: `/applications/${id}`, label: name }}
        description="Only the fields below change. Everything else is left as it is."
        title={`Edit ${name}`}
      />
      <Card>
        <CardContent>
          <ApplicationEditForm
            clientId={id}
            defaults={{
              audience: client.audience ?? [],
              grantTypes: client.grant_types ?? [],
              postLogoutRedirectUris: client.post_logout_redirect_uris ?? [],
              redirectUris: client.redirect_uris ?? [],
              scope: client.scope ?? "",
              skipConsent: client.skip_consent ?? false,
            }}
            name={client.client_name ?? ""}
          />
        </CardContent>
      </Card>

      <DetailCard title="Fixed at registration">
        <div className="flex flex-col gap-5">
          <DetailList>
            <DetailRow
              label="Client ID"
              mono
              value={
                <span className="inline-flex items-center gap-1">
                  {client.client_id}
                  <CopyButton value={client.client_id ?? ""} />
                </span>
              }
            />
            <DetailRow
              label="Type"
              value={isPublic ? "public" : "confidential"}
            />
            <DetailRow label="Owner" value={client.owner || "platform"} />
          </DetailList>

          <p className="max-w-prose text-muted-foreground text-sm">
            Hydra minted the client id and every token it has issued names it,
            so it cannot be changed; a different id is a new registration. The
            type decides how every deployed copy of the application
            authenticates, and the owner decides which organisation may see it,
            so both are set once, here, deliberately.
          </p>

          {isPublic ? (
            <p className="max-w-prose text-muted-foreground text-sm">
              Public client: there is no secret to change. Token requests are
              bound by PKCE instead.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-muted-foreground text-sm">
                The client secret cannot be shown. Hydra stores only a hash, so
                the value at creation was the only copy. If it was lost or
                leaked, rotate: a new secret is generated and shown once, and
                the old one stops authenticating at that moment.
              </p>
              <ApplicationSecretForm clientId={id} />
            </div>
          )}
        </div>
      </DetailCard>
    </div>
  );
}
