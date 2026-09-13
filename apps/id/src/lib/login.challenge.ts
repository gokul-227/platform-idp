import "server-only";

import type { Session } from "@ory/client-fetch";
import { hydraAdmin } from "./hydra";

/**
 * Completing Hydra's login step from the session this app already holds.
 *
 * This app is Hydra's login provider (`oauth2_provider` in
 * `ory/kratos/kratos.yml` points Hydra at Kratos, whose login UI is this app),
 * so a `login_challenge` arriving at `/login` is Hydra asking *us* who the
 * person is. Handing the challenge to Kratos untouched is what made
 * Organizations look broken: Kratos marks a login flow carrying an
 * `oauth2_login_challenge` as `refresh: true` while Hydra holds no session of
 * its own, so an already-signed-in person is asked to confirm it is them and
 * lands on a sign-in screen they did not ask for. There is nothing to confirm —
 * the Kratos session cookie on that very request already proves who they are.
 *
 * So the challenge is answered here when it safely can be, and passed through
 * to Kratos otherwise. The four refusals below are what keeps "safely" honest;
 * each one is a case where the authorization request is asking for something a
 * session cookie does not establish, and each falls back to the full flow
 * rather than failing.
 */

/** `prompt` is a space-delimited list per OIDC Core 3.1.2.1. */
const PROMPT_SEPARATOR = /\s+/;

/**
 * `prompt=login` and `max_age` are the RP's two ways of demanding fresh
 * authentication, and neither survives into the login request as a field —
 * Hydra exposes the authorization URL and expects the login provider to read
 * them off it. Skipping that parse would silently ignore both, which turns a
 * deliberate re-authentication request into a no-op.
 */
function reauthenticationDemand(requestUrl: string): {
  maxAge: number | null;
  wantsFreshLogin: boolean;
} {
  let params: URLSearchParams;
  try {
    params = new URL(requestUrl).searchParams;
  } catch {
    // An unparseable request URL is not something to guess at: treat it as a
    // demand for the full flow.
    return { maxAge: 0, wantsFreshLogin: true };
  }
  const maxAgeRaw = params.get("max_age");
  const maxAge = maxAgeRaw === null ? null : Number(maxAgeRaw);
  return {
    maxAge: maxAge !== null && Number.isFinite(maxAge) ? maxAge : null,
    wantsFreshLogin: (params.get("prompt") ?? "")
      .split(PROMPT_SEPARATOR)
      .includes("login"),
  };
}

/** Seconds since the session's own authentication, for the `max_age` check. */
function sessionAge(session: Session): number {
  // `authenticated_at` is a Date on this client, not the wire's string.
  const authenticatedAt = session.authenticated_at?.getTime() ?? Number.NaN;
  if (Number.isNaN(authenticatedAt)) {
    // No usable timestamp means `max_age` cannot be honoured, so it is treated
    // as unsatisfiable rather than satisfied.
    return Number.POSITIVE_INFINITY;
  }
  return (Date.now() - authenticatedAt) / 1000;
}

/**
 * Where Hydra wants the browser next, or null to let Kratos run the flow.
 *
 * Null is always a safe answer: the caller falls through to the round trip that
 * worked before, so a refusal here costs a screen rather than access.
 */
export async function acceptLoginChallenge(
  challenge: string,
  session: Session
): Promise<string | null> {
  const subject = session.identity?.id;
  if (!subject) {
    return null;
  }

  let request: Awaited<ReturnType<typeof hydraAdmin.getOAuth2LoginRequest>>;
  try {
    request = await hydraAdmin.getOAuth2LoginRequest({
      loginChallenge: challenge,
    });
  } catch {
    // A stale or already-consumed challenge. Kratos's own error handling is
    // better than anything this could render.
    return null;
  }

  // First-party only. `skip_consent` is the operator marking a client as one of
  // ours, on the client itself rather than in a list here, and it is the same
  // signal the consent screen already trusts to skip itself. Without this gate,
  // any client registered on this issuer could obtain a token for whoever
  // happened to be signed in, with no screen shown — the browser's ambient
  // session turned into a silent grant.
  if (request.client?.skip_consent !== true) {
    return null;
  }

  // Hydra already knows a subject for this browser and it is somebody else.
  // Accepting would attach this authorization to the wrong person; Kratos owns
  // the account switch.
  if (request.subject && request.subject !== subject) {
    return null;
  }

  const { maxAge, wantsFreshLogin } = reauthenticationDemand(
    request.request_url
  );
  if (wantsFreshLogin) {
    return null;
  }
  if (maxAge !== null && sessionAge(session) > maxAge) {
    return null;
  }

  try {
    const completed = await hydraAdmin.acceptOAuth2LoginRequest({
      loginChallenge: challenge,
      acceptOAuth2LoginRequest: {
        // What actually authenticated the person, carried through so the token
        // reports the method rather than claiming a password login happened.
        acr: session.authenticator_assurance_level ?? "aal1",
        amr: session.authentication_methods?.flatMap((entry) =>
          entry.method ? [entry.method as string] : []
        ),
        // No Hydra session. Remembering one buys nothing — this accept is
        // already silent, answered from the Kratos cookie on the request — and
        // it outlives the session it was derived from, which this app cannot
        // revoke. A remembered subject then contradicts Kratos the moment
        // somebody else signs in on the browser: Hydra answers `skip: true` for
        // the previous person, the refusal below sends the flow to Kratos, and
        // Kratos restarts it with `prompt=login` — an already-signed-in visitor
        // asked to confirm it is them.
        remember: false,
        subject,
      },
    });
    return completed.redirect_to;
  } catch {
    return null;
  }
}
