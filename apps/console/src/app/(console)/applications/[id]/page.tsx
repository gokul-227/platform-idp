import { formatDate } from "@aec-craft/platform-id-contracts/common/format";
import { Badge } from "@aec-craft/ui/components/primitives/badge";
import type { OAuth2Client } from "@ory/client-fetch";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuditHistory } from "@/components/audit.history";
import { CopyButton } from "@/components/copy.button";
import {
  DetailCard,
  DetailJson,
  DetailLines,
  DetailList,
  DetailRow,
  hasEntries,
} from "@/components/detail.list";
import { PageHeader } from "@/components/page.header";
import { listEventsForResource } from "@/lib/audit.feed";
import { hydraAdmin } from "@/lib/hydra";
import { ApplicationMenu } from "../application.menu";

/**
 * Per-client token lifespan overrides. Hydra returns one field per
 * (grant, token) pair and leaves them null when the global default applies,
 * so the section renders only what an operator actually set.
 */
const LIFESPANS: readonly {
  label: string;
  get: (client: OAuth2Client) => string | null | undefined;
}[] = [
  {
    label: "Authorization code · access",
    get: (c) => c.authorization_code_grant_access_token_lifespan,
  },
  {
    label: "Authorization code · id",
    get: (c) => c.authorization_code_grant_id_token_lifespan,
  },
  {
    label: "Authorization code · refresh",
    get: (c) => c.authorization_code_grant_refresh_token_lifespan,
  },
  {
    label: "Refresh · access",
    get: (c) => c.refresh_token_grant_access_token_lifespan,
  },
  {
    label: "Refresh · id",
    get: (c) => c.refresh_token_grant_id_token_lifespan,
  },
  {
    label: "Refresh · refresh",
    get: (c) => c.refresh_token_grant_refresh_token_lifespan,
  },
  {
    label: "Client credentials · access",
    get: (c) => c.client_credentials_grant_access_token_lifespan,
  },
  {
    label: "Device code · access",
    get: (c) => c.device_authorization_grant_access_token_lifespan,
  },
  {
    label: "JWT bearer · access",
    get: (c) => c.jwt_bearer_grant_access_token_lifespan,
  },
];

function secretExpiry(client: OAuth2Client): string | undefined {
  if (client.token_endpoint_auth_method === "none") {
    return;
  }
  // Hydra uses 0 for "never expires".
  return client.client_secret_expires_at
    ? formatDate(new Date(client.client_secret_expires_at * 1000))
    : "never";
}

function hasBranding(client: OAuth2Client): boolean {
  return Boolean(
    client.client_uri ||
      client.logo_uri ||
      client.policy_uri ||
      client.tos_uri ||
      (client.contacts ?? []).length > 0
  );
}

function hasKeys(client: OAuth2Client): boolean {
  return Boolean(
    client.jwks_uri ||
      hasEntries(client.jwks) ||
      client.request_object_signing_alg ||
      client.userinfo_signed_response_alg ||
      client.sector_identifier_uri
  );
}

function setLifespans(
  client: OAuth2Client
): { label: string; value: string }[] {
  const result: { label: string; value: string }[] = [];
  for (const entry of LIFESPANS) {
    const value = entry.get(client);
    if (value) {
      result.push({ label: entry.label, value });
    }
  }
  return result;
}

function SignOutCard({ client }: { client: OAuth2Client }): ReactNode {
  return (
    <DetailCard title="Sign-out">
      <DetailList>
        <DetailRow
          label="Post-logout redirects"
          value={<DetailLines values={client.post_logout_redirect_uris} />}
        />
        <DetailRow
          label="Front-channel"
          mono
          value={client.frontchannel_logout_uri}
        />
        <DetailRow
          label="Front-channel session"
          value={
            client.frontchannel_logout_session_required ? "required" : undefined
          }
        />
        <DetailRow
          label="Back-channel"
          mono
          value={client.backchannel_logout_uri}
        />
        <DetailRow
          label="Back-channel session"
          value={
            client.backchannel_logout_session_required ? "required" : undefined
          }
        />
        <DetailRow
          label="Logout consent"
          value={client.skip_logout_consent ? "skipped" : "required"}
        />
      </DetailList>
    </DetailCard>
  );
}

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

  const history = await listEventsForResource("application", id).catch(() => ({
    events: [],
    total: 0,
  }));

  const isPublic = client.token_endpoint_auth_method === "none";
  const name = client.client_name || "unnamed";
  const lifespans = setLifespans(client);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        actions={<ApplicationMenu id={id} name={client.client_name || null} />}
        back={{ href: "/applications", label: "Applications" }}
        description={client.client_id}
        title={name}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard
          action={
            <span className="flex gap-2">
              <Badge variant="outline">
                {isPublic ? "public" : "confidential"}
              </Badge>
              <Badge variant={client.skip_consent ? "secondary" : "outline"}>
                {client.skip_consent ? "consent skipped" : "consent required"}
              </Badge>
            </span>
          }
          title="Registration"
        >
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
              label="Auth method"
              mono
              value={client.token_endpoint_auth_method}
            />
            <DetailRow
              label="Auth signing alg"
              mono
              value={client.token_endpoint_auth_signing_alg}
            />
            <DetailRow
              label="Client secret"
              value={
                isPublic
                  ? undefined
                  : "stored hashed; rotate on the edit page to replace it"
              }
            />
            <DetailRow label="Secret expires" value={secretExpiry(client)} />
            <DetailRow
              label="Token strategy"
              mono
              value={client.access_token_strategy}
            />
            <DetailRow label="Subject type" mono value={client.subject_type} />
            <DetailRow label="Owner" value={client.owner || "platform"} />
            <DetailRow label="Created" value={formatDate(client.created_at)} />
            <DetailRow label="Updated" value={formatDate(client.updated_at)} />
          </DetailList>
        </DetailCard>

        <DetailCard title="Sign-in">
          <DetailList>
            <DetailRow
              label="Grant types"
              value={(client.grant_types ?? []).join(", ")}
            />
            <DetailRow
              label="Response types"
              value={(client.response_types ?? []).join(", ")}
            />
            <DetailRow label="Scope" value={client.scope} />
            <DetailRow
              label="Audience"
              value={(client.audience ?? []).join(", ")}
            />
            <DetailRow
              label="Redirect URIs"
              value={<DetailLines values={client.redirect_uris} />}
            />
            <DetailRow
              label="CORS origins"
              value={<DetailLines values={client.allowed_cors_origins} />}
            />
            <DetailRow
              label="Request URIs"
              value={<DetailLines values={client.request_uris} />}
            />
          </DetailList>
        </DetailCard>

        <SignOutCard client={client} />

        {hasBranding(client) ? (
          <DetailCard title="Branding">
            <DetailList>
              <DetailRow label="Homepage" mono value={client.client_uri} />
              <DetailRow label="Logo" mono value={client.logo_uri} />
              <DetailRow
                label="Privacy policy"
                mono
                value={client.policy_uri}
              />
              <DetailRow label="Terms" mono value={client.tos_uri} />
              <DetailRow
                label="Contacts"
                value={(client.contacts ?? []).join(", ")}
              />
            </DetailList>
          </DetailCard>
        ) : null}

        {lifespans.length > 0 ? (
          <DetailCard title="Token lifespans">
            <DetailList>
              {lifespans.map((entry) => (
                <DetailRow
                  key={entry.label}
                  label={entry.label}
                  mono
                  value={entry.value}
                />
              ))}
            </DetailList>
          </DetailCard>
        ) : null}

        {hasKeys(client) ? (
          <DetailCard title="Keys and algorithms">
            <DetailList>
              <DetailRow label="JWKS URI" mono value={client.jwks_uri} />
              <DetailRow
                label="Request object alg"
                mono
                value={client.request_object_signing_alg}
              />
              <DetailRow
                label="Userinfo alg"
                mono
                value={client.userinfo_signed_response_alg}
              />
              <DetailRow
                label="Sector identifier"
                mono
                value={client.sector_identifier_uri}
              />
            </DetailList>
            {hasEntries(client.jwks) ? (
              <div className="mt-4">
                <DetailJson value={client.jwks} />
              </div>
            ) : null}
          </DetailCard>
        ) : null}

        {hasEntries(client.metadata) ? (
          <DetailCard title="Metadata">
            <DetailJson value={client.metadata} />
          </DetailCard>
        ) : null}
      </div>

      <AuditHistory
        events={history.events}
        total={history.total}
        viewAllHref={`/audit?resource=application&resourceId=${encodeURIComponent(id)}`}
      />
    </div>
  );
}
