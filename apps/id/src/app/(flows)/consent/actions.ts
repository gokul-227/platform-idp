"use server";

import { recordEvent } from "@aec-craft/platform-id-db/audit";
import type { OAuth2ConsentRequest } from "@ory/client-fetch";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { grantedAudience } from "@/lib/consent.audience";
import { consentSessionForSubject } from "@/lib/consent.claims";
import { hydraAdmin } from "@/lib/hydra";
import { ensurePlatformProfile } from "@/lib/platform.profile";

/**
 * The first `x-forwarded-for` entry is the original client; null rather than a
 * loopback address when nothing was forwarded.
 */
async function requestIp(): Promise<string | null> {
  const store = await headers();
  const forwardedFor = store.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }
  return store.get("x-real-ip");
}

/**
 * Rejects the consent request and records a "denied" event, knowing which OAuth
 * client it happened through. `consent` is passed in where the caller holds it, so
 * one decision does not read the challenge twice; the decline path fetches it
 * best-effort, since a failed read must not block the rejection.
 */
async function deny(
  consentChallenge: string,
  description: string,
  consent?: OAuth2ConsentRequest
): Promise<never> {
  const [request, ip] = await Promise.all([
    consent ??
      hydraAdmin
        .getOAuth2ConsentRequest({ consentChallenge })
        .catch(() => null),
    requestIp().catch(() => null),
  ]);
  const rejected = await hydraAdmin.rejectOAuth2ConsentRequest({
    consentChallenge,
    rejectOAuth2Request: {
      error: "access_denied",
      error_description: description,
    },
  });
  await recordEvent({
    resource: "oauth_consent",
    verb: "denied",
    actorIdentityId: request?.subject ?? null,
    applicationId: request?.client?.client_id ?? null,
    applicationName: request?.client?.client_name ?? null,
    ip,
    context: { reason: description },
    // No resourceId: the application already lives in applicationId, and naming it
    // twice repeats one fact in two columns. Status stays success, because the flow
    // did what the person asked; `denied` is for a refusal the system imposed.
  });
  redirect(rejected.redirect_to);
}

export async function decideConsent(formData: FormData): Promise<void> {
  const consentChallenge = String(formData.get("consent_challenge") ?? "");
  if (!consentChallenge) {
    redirect("/");
  }

  if (formData.get("decision") !== "accept") {
    await deny(consentChallenge, "The user denied the request");
    return;
  }

  // Re-read the challenge rather than trusting the form it was rendered into.
  // The subject and the requested scope are the two things this decision must
  // be bound to, and a hidden input is not where either of them lives.
  const consent = await hydraAdmin.getOAuth2ConsentRequest({
    consentChallenge,
  });
  const session = await consentSessionForSubject(consent.subject ?? "");
  if (!session) {
    await deny(
      consentChallenge,
      "The session did not match the request",
      consent
    );
    return;
  }

  // Before a token naming this subject exists, the platform should have a row
  // for them. Awaited, so the row is there by the time the application makes its
  // first call, and non-fatal inside.
  await ensurePlatformProfile(consent.subject ?? "");

  // Intersected, not taken: Hydra's own ceiling is the client's registered
  // scope, so a wider request is refused there, but the set this app grants
  // should be one the request actually asked for.
  const requested = new Set(consent.requested_scope ?? []);
  const grantScope = formData
    .getAll("grant_scope")
    .map(String)
    .filter((scope) => requested.has(scope));

  const completed = await hydraAdmin.acceptOAuth2ConsentRequest({
    consentChallenge,
    acceptOAuth2ConsentRequest: {
      grant_scope: grantScope,
      // Dropping this issues an opaque token instead of one the resource can
      // read, which surfaces as a 401 on every relayed call while the sign-in
      // itself looks fine. The skipped path passes it too.
      grant_access_token_audience: grantedAudience(consent),
      remember: formData.get("remember") === "on",
      // Indefinite. An hour meant "do not ask again" lasted an hour, which reads
      // as the checkbox being ignored. The grant ends when the person revokes
      // the application, which is the only event that should end it.
      remember_for: 0,
      session,
    },
  });
  // Same shape as deny()'s event, status "success" instead of "denied" — a
  // granted consent is this app's other real application-context event, and
  // the far more common one. Recorded after Hydra accepts, so a failed grant
  // isn't logged as a success.
  await recordEvent({
    resource: "oauth_consent",
    verb: "granted",
    actorIdentityId: consent.subject ?? null,
    applicationId: consent.client?.client_id ?? null,
    applicationName: consent.client?.client_name ?? null,
    ip: await requestIp().catch(() => null),
    payload: { scope: grantScope },
  });
  redirect(completed.redirect_to);
}
