"use server";

import { randomBytes } from "node:crypto";
import { type OAuth2Client, ResponseError } from "@ory/client-fetch";
import { revalidatePath } from "next/cache";
import { recordConsoleEvent } from "@/lib/audit.record";
import { hydraAdmin } from "@/lib/hydra";
import { getActor } from "@/lib/staff";
import {
  changedFieldsOf,
  readInput,
  refuse,
  responseTypesFor,
} from "./application.input";

/**
 * An "application" in the console is one OAuth2 client registration in
 * Hydra. Protocol field names (`client_id`, `redirect_uris`) keep Hydra's
 * casing; everything the console owns speaks application.
 */
export async function deleteApplication(id: string): Promise<void> {
  // Read before deleting, so the audit row can still name what it deleted —
  // Hydra has nothing left to ask once the client is gone.
  const name = await hydraAdmin
    .getOAuth2Client({ id })
    .then((client) => client.client_name ?? id)
    .catch(() => id);
  await hydraAdmin.deleteOAuth2Client({ id });
  await recordConsoleEvent({
    resource: "application",
    verb: "deleted",
    resourceId: id,
    resourceLabel: name,
  });
  revalidatePath("/applications");
}

/**
 * Hydra names what it rejected in `error_description`; without reading it the
 * operator gets "check the values" for a mistake Hydra already explained.
 */
async function describe(error: unknown, fallback: string): Promise<string> {
  if (!(error instanceof ResponseError)) {
    return fallback;
  }
  const body: unknown = await error.response.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    "error_description" in body &&
    typeof body.error_description === "string" &&
    body.error_description
  ) {
    return body.error_description;
  }
  return fallback;
}

export interface CreateApplicationResult {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  error?: string | undefined;
}

export async function createApplication(
  _previous: CreateApplicationResult,
  formData: FormData
): Promise<CreateApplicationResult> {
  // Every action authorizes for itself. The proxy matcher covers these routes,
  // but a server action is reachable by its own id, so the matcher is not the
  // last word on who ran it. Any operator may manage applications; what only a
  // superadmin may do is change who is an operator.
  if (!(await getActor())) {
    return { error: "Operator access required." };
  }
  const input = readInput(formData);
  const isPublic = formData.get("type") === "public";
  const owner = String(formData.get("owner") ?? "").trim();

  const invalid = refuse(input);
  if (invalid) {
    return { error: invalid };
  }

  try {
    const client = await hydraAdmin.createOAuth2Client({
      oAuth2Client: {
        client_name: input.name,
        grant_types: input.grantTypes,
        // Org-scoped application management filters on this via
        // listOAuth2Clients({ owner }); empty means platform-level.
        owner,
        audience: input.audience,
        post_logout_redirect_uris: input.postLogoutRedirectUris,
        redirect_uris: input.redirectUris,
        response_types: input.grantTypes.includes("authorization_code")
          ? ["code"]
          : [],
        scope: input.scope,
        skip_consent: input.skipConsent,
        skip_logout_consent: input.skipConsent,
        // `client_secret_post`, matching what our own client sends. Registered as
        // `client_secret_basic` the token exchange fails with `invalid_client`
        // naming both methods, long after sign-in appeared to succeed.
        token_endpoint_auth_method: isPublic ? "none" : "client_secret_post",
      },
    });
    await recordConsoleEvent({
      resource: "application",
      verb: "created",
      resourceId: client.client_id,
      resourceLabel: input.name,
    });
    revalidatePath("/applications");
    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
    };
  } catch (error) {
    return {
      error: await describe(
        error,
        "Hydra rejected the registration. Check the values."
      ),
    };
  }
}

/** Which of the form's fields actually changed, compared against the client
 * as Hydra had it — so the audit row's metadata says which fields changed
 * instead of just "updated the application" for every edit. */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export async function updateApplication(
  formData: FormData
): Promise<{ error?: string }> {
  // Every action authorizes for itself. The proxy matcher covers these routes,
  // but a server action is reachable by its own id, so the matcher is not the
  // last word on who ran it. Any operator may manage applications; what only a
  // superadmin may do is change who is an operator.
  if (!(await getActor())) {
    return { error: "Operator access required." };
  }
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "Missing client id." };
  }
  const input = readInput(formData);
  const invalid = refuse(input);
  if (invalid) {
    return { error: invalid };
  }

  let client: OAuth2Client;
  try {
    client = await hydraAdmin.getOAuth2Client({ id });
  } catch {
    return { error: "That application no longer exists." };
  }

  try {
    // PATCH, not PUT: Hydra's PUT replaces the whole registration, so every
    // field this form does not carry (token lifespans, JWKS, branding, CORS
    // origins, owner) would be cleared. Verified on v26.2.0, which also resets
    // `scope` to its default.
    await hydraAdmin.patchOAuth2Client({
      id,
      jsonPatch: [
        { op: "replace", path: "/client_name", value: input.name },
        { op: "replace", path: "/audience", value: input.audience },
        { op: "replace", path: "/redirect_uris", value: input.redirectUris },
        {
          op: "replace",
          path: "/post_logout_redirect_uris",
          value: input.postLogoutRedirectUris,
        },
        { op: "replace", path: "/grant_types", value: input.grantTypes },
        {
          op: "replace",
          path: "/response_types",
          value: responseTypesFor(client, input.grantTypes),
        },
        { op: "replace", path: "/scope", value: input.scope },
        { op: "replace", path: "/skip_consent", value: input.skipConsent },
        // Both together, as at creation, so a logout prompt nobody chose cannot
        // appear from a consent change.
        {
          op: "replace",
          path: "/skip_logout_consent",
          value: input.skipConsent,
        },
      ],
    });
  } catch (error) {
    const reason = await describe(error, "Hydra rejected the change.");
    await recordConsoleEvent({
      resource: "application",
      verb: "updated",
      context: { reason },
      resourceId: id,
      resourceLabel: input.name,
      status: "failure",
    });
    return { error: reason };
  }

  await recordConsoleEvent({
    resource: "application",
    verb: "updated",
    payload: { changes: changedFieldsOf(client, input) },
    resourceId: id,
    resourceLabel: input.name,
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  return {};
}

export interface RotateSecretResult {
  clientSecret?: string | undefined;
  error?: string | undefined;
}

/**
 * Replace a confidential client's secret. Hydra keeps only a hash, so this is a
 * cutover and not an overlap: the old secret stops authenticating the moment the
 * new one is written, and the response is the one time the new one can be read.
 */
export async function rotateApplicationSecret(
  id: string
): Promise<RotateSecretResult> {
  // Every action authorizes for itself. The proxy matcher covers these routes,
  // but a server action is reachable by its own id, so the matcher is not the
  // last word on who ran it. Any operator may manage applications; what only a
  // superadmin may do is change who is an operator.
  if (!(await getActor())) {
    return { error: "Operator access required." };
  }
  if (!id) {
    return { error: "Missing client id." };
  }
  // Ory Network's rotation endpoint (`POST /admin/clients/{id}/secrets/rotate`,
  // which keeps the previous secret valid) 404s on Hydra OSS, so the secret is
  // generated here and patched in.
  const secret = randomBytes(32).toString("base64url");
  const name = await hydraAdmin
    .getOAuth2Client({ id })
    .then((client) => client.client_name ?? id)
    .catch(() => id);
  try {
    const client = await hydraAdmin.patchOAuth2Client({
      id,
      jsonPatch: [{ op: "replace", path: "/client_secret", value: secret }],
    });
    await recordConsoleEvent({
      resource: "application_secret",
      verb: "rotated",
      resourceId: id,
      resourceLabel: name,
    });
    revalidatePath(`/applications/${id}`);
    return { clientSecret: client.client_secret ?? secret };
  } catch (error) {
    const reason = await describe(error, "Hydra rejected the rotation.");
    await recordConsoleEvent({
      resource: "application_secret",
      verb: "rotated",
      context: { reason },
      resourceId: id,
      resourceLabel: name,
      status: "failure",
    });
    return { error: reason };
  }
}
