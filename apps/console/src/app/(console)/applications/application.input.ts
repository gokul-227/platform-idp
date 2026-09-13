import type { OAuth2Client } from "@ory/client-fetch";
import { GRANT_VALUES } from "./application.grants";

/** One field a save changed, as the audit payload records it. */
/** One field a save changed, as the audit payload records it. Values stay
 *  `unknown` because the same shape carries strings, lists and flags. */
interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Reading and checking one application form, and working out what a save
 * actually changed. Out of `actions.ts` because none of it talks to Hydra: it
 * is the part worth reading on its own, and the part a test can reach without
 * a `"use server"` boundary in the way.
 */

/** The fields the create and the edit form share. */
export interface ApplicationInput {
  audience: string[];
  grantTypes: string[];
  name: string;
  postLogoutRedirectUris: string[];
  redirectUris: string[];
  scope: string;
  skipConsent: boolean;
}

export function readInput(formData: FormData): ApplicationInput {
  return {
    audience: String(formData.get("audience") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    grantTypes: formData.getAll("grant_types").map(String),
    name: String(formData.get("name") ?? "").trim(),
    postLogoutRedirectUris: String(
      formData.get("post_logout_redirect_uris") ?? ""
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    redirectUris: String(formData.get("redirect_uris") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    scope: String(formData.get("scope") ?? "").trim(),
    // Ownership, not confidentiality, decides consent: signing in to our own
    // app is not the user granting a third party access to their account.
    skipConsent: formData.get("skip_consent") === "true",
  };
}

/**
 * Hydra validates neither a registration nor a patch: an unknown grant type and
 * a redirect URI that is not a URL are both stored exactly as sent and fail much
 * later, against a real authorization request. So this is the only check either
 * operation gets.
 */
export function refuse(input: ApplicationInput): string | undefined {
  if (!input.name) {
    return "Name is required.";
  }
  if (input.grantTypes.length === 0) {
    return "Pick at least one grant type; a client with none cannot ask for a token.";
  }
  const unknown = input.grantTypes.find(
    (grant) => !GRANT_VALUES.includes(grant)
  );
  if (unknown) {
    return `Unknown grant type "${unknown}".`;
  }
  if (
    input.grantTypes.includes("authorization_code") &&
    input.redirectUris.length === 0
  ) {
    return "Authorization-code applications need at least one redirect URI.";
  }
  const malformed = input.redirectUris.find((uri) => !URL.canParse(uri));
  if (malformed) {
    return `"${malformed}" is not an absolute URL. Redirect URIs are matched whole, scheme included.`;
  }
  // Hydra grants only an audience already on the client, and drops a requested
  // one that is not, so a typo here surfaces much later as a token whose `aud`
  // is empty and a resource server that refuses it.
  const badAudience = input.audience.find((value) => !URL.canParse(value));
  if (badAudience) {
    return `"${badAudience}" is not an absolute URI. An audience names an API, so it is that API's own URL.`;
  }
  // Hydra refuses an unlisted post-logout URI with `invalid_request` at the end
  // session endpoint, which is the one leg no sign-in exercises.
  const badLogout = input.postLogoutRedirectUris.find(
    (uri) => !URL.canParse(uri)
  );
  if (badLogout) {
    return `"${badLogout}" is not an absolute URL. Sign-out redirect URIs are matched whole, scheme included.`;
  }
  return;
}

/**
 * Before/after per changed field, for the audit row's `metadata.changes` —
 * both sides are already in scope at the one call site that needs this, so
 * capturing real values costs nothing an approximation would have saved.
 * None of these fields are secrets (the client secret has its own rotation
 * action and audit trail), so nothing here needs redaction.
 */
export function changedFieldsOf(
  client: OAuth2Client,
  input: ApplicationInput
): FieldChange[] {
  const changed: FieldChange[] = [];
  if ((client.client_name ?? "") !== input.name) {
    changed.push({
      field: "name",
      from: client.client_name ?? "",
      to: input.name,
    });
  }
  if (
    JSON.stringify(client.redirect_uris ?? []) !==
    JSON.stringify(input.redirectUris)
  ) {
    changed.push({
      field: "redirectUris",
      from: client.redirect_uris ?? [],
      to: input.redirectUris,
    });
  }
  if (
    JSON.stringify(client.post_logout_redirect_uris ?? []) !==
    JSON.stringify(input.postLogoutRedirectUris)
  ) {
    changed.push({
      field: "postLogoutRedirectUris",
      from: client.post_logout_redirect_uris ?? [],
      to: input.postLogoutRedirectUris,
    });
  }
  if (
    JSON.stringify([...(client.grant_types ?? [])].sort()) !==
    JSON.stringify([...input.grantTypes].sort())
  ) {
    changed.push({
      field: "grantTypes",
      from: client.grant_types ?? [],
      to: input.grantTypes,
    });
  }
  if ((client.scope ?? "") !== input.scope) {
    changed.push({
      field: "scope",
      from: client.scope ?? "",
      to: input.scope,
    });
  }
  if (
    JSON.stringify(client.audience ?? []) !== JSON.stringify(input.audience)
  ) {
    changed.push({
      field: "audience",
      from: client.audience ?? [],
      to: input.audience,
    });
  }
  if (Boolean(client.skip_consent) !== input.skipConsent) {
    changed.push({
      field: "skipConsent",
      from: Boolean(client.skip_consent),
      to: input.skipConsent,
    });
  }
  return changed;
}

/**
 * Response types are not a form field, they follow from the grants. Only `code`
 * is touched, so a hybrid client keeps the `id_token` it was registered with
 * rather than losing it to an unrelated edit.
 */
export function responseTypesFor(
  client: OAuth2Client,
  grantTypes: string[]
): string[] {
  const types = new Set(client.response_types ?? []);
  if (grantTypes.includes("authorization_code")) {
    types.add("code");
  } else {
    types.delete("code");
  }
  return [...types];
}
