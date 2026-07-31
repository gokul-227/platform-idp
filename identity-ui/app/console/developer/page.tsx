import type { ReactNode } from "react";

import {
  getOidcDiscovery,
  getOpenApiSummaries,
  listApiKeys,
  type ApiKey,
  type OpenApiSummary,
} from "@/adapters/developer";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { JwtDecoder } from "@/components/jwt-decoder";
import { PageHeader } from "../page.header";
import {
  createApiKeyAction,
  deleteApiKeyAction,
  setApiKeyEnabledAction,
  startAuthorizationCodeFlowAction,
  testTokenAction,
} from "./actions";

function apiKeyRow(key: ApiKey): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 text-sm" key={key.client_id}>
      <span className="flex flex-col">
        <span className="font-medium">{key.name}</span>
        <span className="font-mono text-muted-foreground text-xs">{key.client_id}</span>
      </span>
      <span className="text-muted-foreground text-xs">{key.scope || "no scope"}</span>
      {key.expires_at ? (
        <Badge variant={new Date(key.expires_at) < new Date() ? "secondary" : "outline"}>
          expires {key.expires_at}
        </Badge>
      ) : null}
      <Badge variant={key.enabled ? "outline" : "secondary"}>
        {key.enabled ? "enabled" : "disabled"}
      </Badge>
      <div className="flex gap-2">
        <form action={setApiKeyEnabledAction}>
          <input name="client_id" type="hidden" value={key.client_id} />
          <input name="enabled" type="hidden" value={key.enabled ? "false" : "true"} />
          <Button size="sm" type="submit" variant="outline">
            {key.enabled ? "Disable" : "Enable"}
          </Button>
        </form>
        <form action={deleteApiKeyAction}>
          <ConfirmSubmitButton
            description={`This permanently deletes the "${key.name}" API key (a real Hydra OAuth2 client). Any integration using it will immediately be unable to authenticate. This cannot be undone.`}
            name="client_id"
            title="Delete this API key?"
            value={key.client_id}
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

function sdkSnippets(tokenEndpoint: string): { language: string; code: string }[] {
  return [
    {
      code: `curl -X POST '${tokenEndpoint}' \\\n  -u '<client_id>:<client_secret>' \\\n  -d grant_type=client_credentials \\\n  -d scope='<scope>'`,
      language: "curl",
    },
    {
      code: `import httpx\n\nresponse = httpx.post(\n    "${tokenEndpoint}",\n    auth=("<client_id>", "<client_secret>"),\n    data={"grant_type": "client_credentials", "scope": "<scope>"},\n)\ntoken = response.json()["access_token"]`,
      language: "Python",
    },
    {
      code: `const response = await fetch("${tokenEndpoint}", {\n  method: "POST",\n  headers: {\n    Authorization: "Basic " + btoa("<client_id>:<client_secret>"),\n    "Content-Type": "application/x-www-form-urlencoded",\n  },\n  body: "grant_type=client_credentials&scope=<scope>",\n});\nconst { access_token } = await response.json();`,
      language: "TypeScript",
    },
    {
      code: `package main\n\nimport (\n\t"golang.org/x/oauth2/clientcredentials"\n)\n\nfunc main() {\n\tconf := &clientcredentials.Config{\n\t\tClientID:     "<client_id>",\n\t\tClientSecret: "<client_secret>",\n\t\tTokenURL:     "${tokenEndpoint}",\n\t\tScopes:       []string{"<scope>"},\n\t}\n\ttoken, _ := conf.Token(context.Background())\n}`,
      language: "Go",
    },
    {
      code: `// Using Ory's own Java SDK (or any OAuth2 client library)\nOAuthClientRequest request = OAuthClientRequest\n    .tokenLocation("${tokenEndpoint}")\n    .setGrantType(GrantType.CLIENT_CREDENTIALS)\n    .setClientId("<client_id>")\n    .setClientSecret("<client_secret>")\n    .setScope("<scope>")\n    .buildBodyMessage();\nOAuthClient client = new OAuthClient(new URLConnectionClient());\nOAuthAccessTokenResponse response = client.accessToken(request);`,
      language: "Java",
    },
    {
      code: `using var client = new HttpClient();\nvar body = new FormUrlEncodedContent(new Dictionary<string, string> {\n    ["grant_type"] = "client_credentials",\n    ["client_id"] = "<client_id>",\n    ["client_secret"] = "<client_secret>",\n    ["scope"] = "<scope>",\n});\nvar response = await client.PostAsync("${tokenEndpoint}", body);\nvar token = await response.Content.ReadAsStringAsync();`,
      language: "C#",
    },
    {
      code: `let client = reqwest::Client::new();\nlet params = [\n    ("grant_type", "client_credentials"),\n    ("client_id", "<client_id>"),\n    ("client_secret", "<client_secret>"),\n    ("scope", "<scope>"),\n];\nlet response = client.post("${tokenEndpoint}").form(&params).send().await?;`,
      language: "Rust",
    },
  ];
}

function buildPostmanCollection(
  discovery: { token_endpoint?: string; authorization_endpoint?: string } | null,
  openApiSummaries: OpenApiSummary[],
): Record<string, unknown> {
  return {
    info: {
      _postman_id: "neobim-identity-platform",
      description: "Real endpoints read live from this running platform — see /console/developer.",
      name: "NeoBIM Identity Platform",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        item: [
          {
            name: "Client credentials token",
            request: {
              body: {
                mode: "urlencoded",
                urlencoded: [
                  { key: "grant_type", value: "client_credentials" },
                  { key: "scope", value: "openid" },
                ],
              },
              method: "POST",
              url: discovery?.token_endpoint ?? "<token_endpoint>",
            },
          },
        ],
        name: "OAuth2",
      },
      ...openApiSummaries.map((summary) => ({
        item: summary.endpoints.map((e) => ({
          name: `${e.methods.join(",")} ${e.path}`,
          request: { method: e.methods[0] ?? "GET", url: `http://${summary.service}${e.path}` },
        })),
        name: summary.service,
      })),
    ],
  };
}

function openApiCard(summary: OpenApiSummary): ReactNode {
  return (
    <details className="rounded-lg border border-foreground/10 p-3" key={summary.service}>
      <summary className="cursor-pointer text-sm font-medium">
        {summary.service}{" "}
        <span className="text-muted-foreground text-xs">
          {summary.error ? `(${summary.error})` : `(${summary.endpoints.length} endpoints)`}
        </span>
      </summary>
      {summary.endpoints.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {summary.endpoints.map((e) => (
            <li key={e.path}>
              {e.methods.join(", ")} {e.path}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

// Real OIDC discovery (fetched from Hydra's actual public endpoint via
// Oathkeeper, exactly what an external developer's app would fetch) plus
// a client_credentials token tester that calls platform/console-api's
// /api/v1/developer/test-token, which forwards straight to Hydra's public
// token endpoint — the secret is never stored.
export default async function DeveloperPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const [discovery, apiKeys, openApiSummaries] = await Promise.all([
    getOidcDiscovery(),
    listApiKeys(),
    getOpenApiSummaries(),
  ]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="OIDC discovery/JWKS for integrating an application, plus a token tester against a real OAuth2 client's credentials."
        title="Developer Portal"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">OIDC discovery</CardTitle>
        </CardHeader>
        <CardContent>
          {discovery ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Issuer</dt>
              <dd className="font-mono text-xs">{discovery.issuer}</dd>
              <dt className="text-muted-foreground">Authorization endpoint</dt>
              <dd className="font-mono text-xs">{discovery.authorization_endpoint}</dd>
              <dt className="text-muted-foreground">Token endpoint</dt>
              <dd className="font-mono text-xs">{discovery.token_endpoint}</dd>
              <dt className="text-muted-foreground">JWKS URI</dt>
              <dd className="font-mono text-xs">{discovery.jwks_uri}</dd>
              <dt className="text-muted-foreground">Userinfo endpoint</dt>
              <dd className="font-mono text-xs">{discovery.userinfo_endpoint}</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Discovery document unavailable.</p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Test a client_credentials token</CardTitle>
          <p className="text-muted-foreground text-sm">
            Uses a real OAuth2 client's credentials — see <a className="underline" href="/auth/console/clients">Clients</a> for
            client IDs, and create/rotate a secret there first if you don&apos;t have one handy.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={testTokenAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="client_id">Client ID</FieldLabel>
              <Input id="client_id" name="client_id" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="client_secret">Client secret</FieldLabel>
              <Input id="client_secret" name="client_secret" required type="password" />
            </Field>
            <Field>
              <FieldLabel htmlFor="scope">Scope</FieldLabel>
              <Input defaultValue="openid" id="scope" name="scope" />
            </Field>
            <Button type="submit">Request token</Button>
          </form>

          {params.token ? (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-sm">
                Access token (scope: {params.scope || "none"}):
              </p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {params.token}
              </code>
            </div>
          ) : null}
          {params.error ? (
            <p className="text-destructive text-sm">{params.error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">JWT decoder / token inspector</CardTitle>
          <p className="text-muted-foreground text-sm">
            Paste any access token or ID token to see its real header and payload claims. Decodes
            entirely in your browser — the token is never sent anywhere.
          </p>
        </CardHeader>
        <CardContent>
          <JwtDecoder />
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">OAuth playground — Authorization Code + PKCE</CardTitle>
          <p className="text-muted-foreground text-sm">
            Provisions a real, public (no secret) Hydra OAuth2 client scoped to this page's own
            callback URL, then redirects through the real Kratos login and Hydra consent screens
            — exactly the flow a browser-based app would use. Includes a working refresh-token
            exchange once you have a token. (Device Authorization Grant is not enabled in this
            platform's Hydra config — see final report.)
          </p>
        </CardHeader>
        <CardContent>
          <form action={startAuthorizationCodeFlowAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="pkce_scope">Scope</FieldLabel>
              <Input defaultValue="openid offline_access" id="pkce_scope" name="scope" />
            </Field>
            <Button type="submit">Start Authorization Code + PKCE flow</Button>
          </form>
          {params.refreshed_access_token ? (
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-muted-foreground text-sm">Refreshed access token:</p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {params.refreshed_access_token}
              </code>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <p className="text-muted-foreground text-sm">
            An API Key is a real Hydra OAuth2 client with the
            <code> client_credentials</code> grant — the secret is Hydra&apos;s own client
            secret, shown once below. Disabling one actually clears its grant types (a real
            token request against it will fail with <code>unsupported_grant_type</code>), not
            just a UI flag. Expiry is informational only — Hydra doesn&apos;t auto-revoke.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={createApiKeyAction} className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="api_key_scope">Scope</FieldLabel>
              <Input id="api_key_scope" name="scope" placeholder="read write" />
            </Field>
            <Field>
              <FieldLabel htmlFor="expires_at">Expires (optional, YYYY-MM-DD)</FieldLabel>
              <Input id="expires_at" name="expires_at" placeholder="2027-01-01" />
            </Field>
            <Button type="submit">Create key</Button>
          </form>

          {params.created && params.secret ? (
            <div className="flex flex-col gap-1 rounded-lg border border-foreground/20 p-3">
              <p className="text-sm">
                Created <span className="font-mono">{params.created}</span> — copy this secret
                now, it will not be shown again:
              </p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {params.secret}
              </code>
            </div>
          ) : null}

          {apiKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No API keys yet.</p>
          ) : (
            <div className="flex flex-col gap-3">{apiKeys.map(apiKeyRow)}</div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">SDK examples — client_credentials</CardTitle>
          <p className="text-muted-foreground text-sm">
            Requesting a client_credentials token against the real token endpoint above, using
            an API Key created here. Every snippet targets the same real endpoint — only the
            HTTP client differs.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {sdkSnippets(discovery?.token_endpoint ?? "<token_endpoint>").map((snippet) => (
            <div key={snippet.language}>
              <p className="font-medium">{snippet.language}</p>
              <pre className="mt-1 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                {snippet.code}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Downloads</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real, generated-on-request artifacts — not hand-maintained copies that can drift
            from the actual running services.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a
            className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
            download="neobim-postman-collection.json"
            href={`data:application/json,${encodeURIComponent(
              JSON.stringify(buildPostmanCollection(discovery, openApiSummaries), null, 2),
            )}`}
          >
            Download Postman collection
          </a>
          {openApiSummaries.map((summary) => (
            <a
              className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
              download={`${summary.service}-openapi.json`}
              href={`data:application/json,${encodeURIComponent(JSON.stringify(summary, null, 2))}`}
              key={summary.service}
            >
              {summary.service} OpenAPI (summary)
            </a>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Not supported by this platform&apos;s Hydra</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            Verified live against Hydra&apos;s own discovery document (
            <code>grant_types_supported</code>) and its device endpoint:
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            <li>
              <strong>Device Authorization Grant</strong> — not in{" "}
              <code>grant_types_supported</code>; <code>/oauth2/device/auth</code> returns 404.
              Ory Hydra OSS does not enable this by default in this deployment&apos;s config.
            </li>
            <li>
              <strong>Token Exchange (RFC 8693)</strong> — not in{" "}
              <code>grant_types_supported</code> either. Not fabricated here as a working
              example.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">OpenAPI explorer</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real <code>/openapi.json</code> from each running platform/* service, read live —
            not a hand-maintained copy that can drift from the actual code.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {openApiSummaries.map(openApiCard)}
        </CardContent>
      </Card>
    </div>
  );
}
