import { staffRoleOf } from "@aec-craft/platform-id-sdk/identity";
import type {
  AcceptOAuth2ConsentRequestSession,
  Identity,
} from "@ory/client-fetch";
import { getSession } from "./kratos";

/**
 * What a token carries beyond `sub`, nested under `ext` as Hydra puts it, or
 * checking an assurance level over OAuth would mean trusting claims nobody
 * emitted.
 *
 * `staffRole` is stated as the identity stores it, and only when the value is one
 * this deployment recognises: a resource server has to gate on something, and the
 * alternative was every one of them reading the estate's own configuration. What
 * bounds it is the audience — a token reaches an API only from a client an
 * operator registered against it — and that API's own role list and assurance
 * floor. Nothing is derived here, so revoking the role in the console is what
 * stops it travelling.
 *
 * Values come from the visitor's own session, so the subject is checked. Null
 * means no session or not the subject's, and a caller must refuse the challenge.
 * `refresh_token_hook` re-derives the same claims from the identity on every
 * refresh, which is what keeps a revoked role from travelling.
 */
export async function consentSessionForSubject(
  subject: string
): Promise<AcceptOAuth2ConsentRequestSession | null> {
  const session = await getSession();
  const identity = session?.identity;
  if (!(subject && identity && identity.id === subject)) {
    return null;
  }
  return sessionForIdentity(
    identity,
    session.authenticator_assurance_level ?? null
  );
}

/**
 * The same claims, built from an identity rather than a session, so consent and
 * `refresh_token_hook` cannot drift. `aal` is passed in: it describes how the
 * session authenticated, which a refresh does not change and a server-to-server
 * call has no session to ask.
 *
 * Nothing is derived. A root holds `staffRole` in `metadata_public` like anyone
 * who administers, so this states what the identity stores and revoking the role
 * is what stops it travelling.
 */
export function sessionForIdentity(
  identity: Identity,
  aal: string | null
): AcceptOAuth2ConsentRequestSession {
  const traits = (identity.traits ?? {}) as { email?: string };
  const claims: Record<string, string> = {};
  if (aal) {
    claims.aal = aal;
  }
  if (traits.email) {
    claims.email = traits.email;
  }
  if (identity.schema_id) {
    claims.schema = identity.schema_id;
  }
  // Unrecognised values state nothing rather than handing a resource server a
  // word it would have to interpret.
  const role = staffRoleOf(identity);
  if (role) {
    claims.staffRole = role;
  }

  // Nothing confidential here, deliberately. Hydra issues JWT access tokens, so
  // whoever holds one can read this without the signing key.
  return { access_token: claims, id_token: claims };
}
