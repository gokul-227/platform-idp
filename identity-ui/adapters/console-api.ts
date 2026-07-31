// Client for platform/console-api — the Python service that owns every
// /console/* mutation that isn't an Applications enable/disable (see
// adapters/app-registry.ts for that one). Identities today; sessions,
// OAuth2 clients and Keto tuples as those phases land.

import "server-only";

import { getEnv } from "@/config/env";

export interface MutationResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function call<T>(
  path: string,
  init: RequestInit,
): Promise<MutationResult<T>> {
  try {
    const response = await fetch(`${getEnv().consoleApiUrl}${path}`, {
      ...init,
      cache: "no-store",
    });
    if (response.status === 204) {
      return { ok: true };
    }
    const body = (await response.json().catch(() => ({}))) as
      | T
      | { error?: string };
    if (!response.ok) {
      const error =
        typeof body === "object" && body && "error" in body
          ? String((body as { error?: string }).error ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
      return { error, ok: false };
    }
    return { data: body as T, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export async function createIdentity(
  email: string,
  password?: string,
): Promise<MutationResult> {
  return call("/api/v1/identities", {
    body: JSON.stringify({ email, ...(password ? { password } : {}) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export async function enableIdentity(identityId: string): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}/enable`, {
    method: "POST",
  });
}

export async function disableIdentity(identityId: string): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}/disable`, {
    method: "POST",
  });
}

export async function deleteIdentity(identityId: string): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}`, {
    method: "DELETE",
  });
}

export async function updateIdentityTraits(
  identityId: string,
  traits: Record<string, unknown>,
): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}/traits`, {
    body: JSON.stringify({ traits }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

export async function forceVerifyIdentity(identityId: string): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}/force-verify`, {
    method: "POST",
  });
}

export async function resetIdentityPassword(
  identityId: string,
  password: string,
): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}/reset-password`, {
    body: JSON.stringify({ password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export async function revokeAdminSession(sessionId: string): Promise<MutationResult> {
  return call(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function revokeAllSessionsForIdentity(
  identityId: string,
): Promise<MutationResult> {
  return call(`/api/v1/identities/${encodeURIComponent(identityId)}/sessions`, {
    method: "DELETE",
  });
}

export interface CreateClientInput {
  clientName: string;
  redirectUris: string[];
  scope: string;
}

export async function createClient(
  input: CreateClientInput,
): Promise<MutationResult<{ client_id: string; client_secret: string }>> {
  return call("/api/v1/clients", {
    body: JSON.stringify({
      client_name: input.clientName,
      redirect_uris: input.redirectUris,
      scope: input.scope,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export interface UpdateClientInput {
  clientName: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  tokenEndpointAuthMethod: string;
  authorizationCodeGrantAccessTokenLifespan?: string;
  authorizationCodeGrantIdTokenLifespan?: string;
  authorizationCodeGrantRefreshTokenLifespan?: string;
  clientCredentialsGrantAccessTokenLifespan?: string;
  refreshTokenGrantAccessTokenLifespan?: string;
  refreshTokenGrantIdTokenLifespan?: string;
  refreshTokenGrantRefreshTokenLifespan?: string;
  // Real Hydra fields (see OAuth2Client's own SDK type) — previously
  // accepted by console-api's ClientRequest model change in this pass but
  // not yet threaded through here.
  jwksUri?: string;
  audience?: string[];
}

export async function updateClient(
  clientId: string,
  input: UpdateClientInput,
): Promise<MutationResult> {
  return call(`/api/v1/clients/${encodeURIComponent(clientId)}`, {
    body: JSON.stringify({
      audience: input.audience ?? [],
      authorization_code_grant_access_token_lifespan:
        input.authorizationCodeGrantAccessTokenLifespan || undefined,
      authorization_code_grant_id_token_lifespan:
        input.authorizationCodeGrantIdTokenLifespan || undefined,
      authorization_code_grant_refresh_token_lifespan:
        input.authorizationCodeGrantRefreshTokenLifespan || undefined,
      client_credentials_grant_access_token_lifespan:
        input.clientCredentialsGrantAccessTokenLifespan || undefined,
      client_name: input.clientName,
      grant_types: input.grantTypes,
      jwks_uri: input.jwksUri || undefined,
      post_logout_redirect_uris: input.postLogoutRedirectUris,
      redirect_uris: input.redirectUris,
      refresh_token_grant_access_token_lifespan:
        input.refreshTokenGrantAccessTokenLifespan || undefined,
      refresh_token_grant_id_token_lifespan:
        input.refreshTokenGrantIdTokenLifespan || undefined,
      refresh_token_grant_refresh_token_lifespan:
        input.refreshTokenGrantRefreshTokenLifespan || undefined,
      response_types: input.responseTypes,
      scope: input.scope,
      token_endpoint_auth_method: input.tokenEndpointAuthMethod,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

export async function rotateClientSecret(
  clientId: string,
): Promise<MutationResult<{ client_secret: string }>> {
  return call(`/api/v1/clients/${encodeURIComponent(clientId)}/rotate-secret`, {
    method: "POST",
  });
}

export async function deleteClient(clientId: string): Promise<MutationResult> {
  return call(`/api/v1/clients/${encodeURIComponent(clientId)}`, {
    method: "DELETE",
  });
}

export interface SubjectSetInput {
  namespace: string;
  object: string;
  relation: string;
}

export interface CreateRelationTupleInput {
  namespace: string;
  object: string;
  relation: string;
  subjectId?: string;
  subjectSet?: SubjectSetInput;
}

export async function createRelationTuple(
  input: CreateRelationTupleInput,
): Promise<MutationResult> {
  return call("/api/v1/relation-tuples", {
    body: JSON.stringify({
      namespace: input.namespace,
      object: input.object,
      relation: input.relation,
      subject_id: input.subjectId,
      subject_set: input.subjectSet
        ? {
            namespace: input.subjectSet.namespace,
            object: input.subjectSet.object,
            relation: input.subjectSet.relation,
          }
        : undefined,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export async function deleteRelationTuple(
  input: CreateRelationTupleInput,
): Promise<MutationResult> {
  const query = new URLSearchParams({
    namespace: input.namespace,
    object: input.object,
    relation: input.relation,
  });
  if (input.subjectSet) {
    query.set("subject_set_namespace", input.subjectSet.namespace);
    query.set("subject_set_object", input.subjectSet.object);
    query.set("subject_set_relation", input.subjectSet.relation);
  } else {
    query.set("subject_id", input.subjectId ?? "");
  }
  return call(`/api/v1/relation-tuples?${query.toString()}`, {
    method: "DELETE",
  });
}
