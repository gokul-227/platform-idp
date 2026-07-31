// Client for platform/console-api's Developer Portal endpoint (token
// tester). Discovery/JWKS are plain public reads, fetched directly since
// they're the exact same public documents any external developer's own
// app would fetch — no admin credentials involved.

import "server-only";

import { getEnv } from "@/config/env";

export interface OidcDiscovery {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  [key: string]: unknown;
}

export async function getOidcDiscovery(): Promise<OidcDiscovery | null> {
  try {
    // Fetched from Hydra's internal admin-network address (:4444, the
    // public port on Hydra's own container, not the admin :4445 one) —
    // NOT the browser-facing kratosBrowserUrl/localhost:4455, which from
    // inside this container is its own loopback, not Oathkeeper (the same
    // internal-vs-browser-facing distinction documented throughout this
    // app's other adapters). The document's own `issuer`/`token_endpoint`
    // fields are still the real browser-facing URLs regardless of which
    // address we used to fetch it — that's baked into Hydra's own config.
    const response = await fetch(
      `${getEnv().hydraAdminUrl.replace(":4445", ":4444")}/.well-known/openid-configuration`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as OidcDiscovery;
  } catch {
    return null;
  }
}

export interface TestTokenResult {
  ok: boolean;
  accessToken?: string;
  scope?: string;
  error?: string;
}

export interface ApiKey {
  client_id: string;
  name: string;
  scope: string;
  enabled: boolean;
  expires_at: string | null;
  created_at: string | null;
}

export async function listApiKeys(): Promise<ApiKey[]> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/api-keys`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { api_keys?: ApiKey[] };
    return body.api_keys ?? [];
  } catch {
    return [];
  }
}

export interface CreateApiKeyResult {
  ok: boolean;
  apiKey?: ApiKey & { client_secret: string };
  error?: string;
}

export async function createApiKey(
  name: string,
  scope: string,
  expiresAt: string | null,
): Promise<CreateApiKeyResult> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/api-keys`, {
      body: JSON.stringify({ expires_at: expiresAt, name, scope }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as
      | (ApiKey & { client_secret: string })
      | { error?: string };
    if (!response.ok) {
      const error = "error" in body ? body.error : undefined;
      return { error: error ?? `HTTP ${response.status}`, ok: false };
    }
    return { apiKey: body as ApiKey & { client_secret: string }, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export interface ApiKeyMutationResult {
  ok: boolean;
  error?: string;
}

export async function setApiKeyEnabled(
  clientId: string,
  enabled: boolean,
): Promise<ApiKeyMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().consoleApiUrl}/api/v1/api-keys/${encodeURIComponent(clientId)}/${enabled ? "enable" : "disable"}`,
      { cache: "no-store", method: "POST" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function deleteApiKey(clientId: string): Promise<ApiKeyMutationResult> {
  try {
    const response = await fetch(
      `${getEnv().consoleApiUrl}/api/v1/api-keys/${encodeURIComponent(clientId)}`,
      { cache: "no-store", method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export interface OpenApiEndpoint {
  path: string;
  methods: string[];
}

export interface OpenApiSummary {
  service: string;
  title: string | null;
  version: string | null;
  endpoints: OpenApiEndpoint[];
  error?: string;
}

// Every platform/* FastAPI service auto-generates a real /openapi.json —
// this reads it directly (no separate hand-maintained spec to drift from
// the actual code) and reduces it to a path/method list for the explorer.
export async function getOpenApiSummaries(): Promise<OpenApiSummary[]> {
  const env = getEnv();
  const services: Array<[string, string]> = [
    ["app-registry", env.appRegistryUrl],
    ["console-api", env.consoleApiUrl],
    ["tenant-service", env.tenantServiceUrl],
    ["audit-service", env.auditServiceUrl],
    ["plugin-service", env.pluginServiceUrl],
    ["flow-service", env.flowServiceUrl],
    ["notification-service", env.notificationServiceUrl],
    ["authorization-service", env.authorizationServiceUrl],
  ];
  return Promise.all(
    services.map(async ([service, baseUrl]) => {
      try {
        const response = await fetch(`${baseUrl}/openapi.json`, { cache: "no-store" });
        if (!response.ok) {
          return { endpoints: [], error: `HTTP ${response.status}`, service, title: null, version: null };
        }
        const spec = (await response.json()) as {
          info?: { title?: string; version?: string };
          paths?: Record<string, Record<string, unknown>>;
        };
        const endpoints = Object.entries(spec.paths ?? {}).map(([path, methods]) => ({
          methods: Object.keys(methods).map((m) => m.toUpperCase()),
          path,
        }));
        return {
          endpoints,
          service,
          title: spec.info?.title ?? null,
          version: spec.info?.version ?? null,
        };
      } catch (error) {
        return {
          endpoints: [],
          error: error instanceof Error ? error.message : String(error),
          service,
          title: null,
          version: null,
        };
      }
    }),
  );
}

export interface PkceClient {
  client_id: string;
}

// A real Hydra client for the Authorization Code + PKCE playground:
// token_endpoint_auth_method "none" (a public client — no secret, since
// PKCE is the security mechanism instead) with grant_types
// authorization_code + refresh_token. Posts the full ClientRequest body
// directly (not through adapters/console-api.ts's narrower createClient
// wrapper, which defaults to a confidential client_secret_post client).
export async function provisionPkceClient(
  redirectUri: string,
  scope: string,
): Promise<{ ok: boolean; clientId?: string; error?: string }> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/clients`, {
      body: JSON.stringify({
        client_name: "Developer Portal — Authorization Code + PKCE playground",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [redirectUri],
        response_types: ["code"],
        scope,
        token_endpoint_auth_method: "none",
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as
      | { client_id?: string }
      | { error?: string };
    if (!response.ok) {
      const error = "error" in body ? body.error : undefined;
      return { error: error ?? `HTTP ${response.status}`, ok: false };
    }
    return { clientId: "client_id" in body ? body.client_id : undefined, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export interface TokenSet {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeAuthorizationCode(
  clientId: string,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ ok: boolean; tokens?: TokenSet; error?: string }> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/developer/exchange-code`, {
      body: JSON.stringify({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as TokenSet;
    if (!response.ok) {
      return { error: body.error_description ?? body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true, tokens: body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<{ ok: boolean; tokens?: TokenSet; error?: string }> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}/api/v1/developer/refresh-token`, {
      body: JSON.stringify({ client_id: clientId, refresh_token: refreshToken }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as TokenSet;
    if (!response.ok) {
      return { error: body.error_description ?? body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { ok: true, tokens: body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function testClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<TestTokenResult> {
  try {
    const response = await fetch(
      `${getEnv().consoleApiUrl}/api/v1/developer/test-token`,
      {
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, scope }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok) {
      return { error: body.error_description ?? body.error ?? `HTTP ${response.status}`, ok: false };
    }
    return { accessToken: body.access_token, ok: true, scope: body.scope };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}
