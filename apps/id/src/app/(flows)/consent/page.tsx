import { Button } from "@aec-craft/ui/components/primitives/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import { Checkbox } from "@aec-craft/ui/components/primitives/checkbox";
import { Label } from "@aec-craft/ui/components/primitives/label";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { grantedAudience } from "@/lib/consent.audience";
import { consentSessionForSubject } from "@/lib/consent.claims";
import { hydraAdmin } from "@/lib/hydra";
import { ensurePlatformProfile } from "@/lib/platform.profile";
import { scopeSentence } from "@/lib/scope";
import { decideConsent } from "./actions";

/**
 * Hydra delegates the OAuth2 consent step here via `?consent_challenge=`.
 * Skippable requests (first-party clients, remembered grants) are accepted
 * server-side without rendering.
 */

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const consentChallenge = params.consent_challenge;
  if (!consentChallenge) {
    redirect("/");
  }

  const consent = await hydraAdmin.getOAuth2ConsentRequest({
    consentChallenge,
  });

  // `skip` is Hydra saying this person already decided; `skip_consent` is the
  // client being first-party. Which clients those are is an operator decision
  // recorded on the client itself, not a deploy-time list.
  if (consent.skip || consent.client?.skip_consent === true) {
    // Same claims as the rendered path, and the same binding: a skipped consent
    // must not yield a thinner token than one somebody clicked through, nor a
    // less well checked one.
    const session = await consentSessionForSubject(consent.subject ?? "");
    if (session) {
      await ensurePlatformProfile(consent.subject ?? "");
      const completed = await hydraAdmin.acceptOAuth2ConsentRequest({
        consentChallenge,
        acceptOAuth2ConsentRequest: {
          grant_scope: consent.requested_scope ?? [],
          grant_access_token_audience: grantedAudience(consent),
          session,
        },
      });
      redirect(completed.redirect_to);
    }
    const rejected = await hydraAdmin.rejectOAuth2ConsentRequest({
      consentChallenge,
      rejectOAuth2Request: {
        error: "access_denied",
        error_description: "The session did not match the request",
      },
    });
    redirect(rejected.redirect_to);
  }

  const clientName =
    consent.client?.client_name ||
    consent.client?.client_id ||
    "An application";

  const requested = consent.requested_scope ?? [];

  return (
    <Card className="gap-8">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">
          Allow {clientName} to use your account?
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          You can change your mind later by signing out of it.
        </p>
      </CardHeader>
      <CardContent>
        <form action={decideConsent} className="flex flex-col gap-6">
          <input
            defaultValue={consentChallenge}
            name="consent_challenge"
            type="hidden"
          />

          {/* Stated, not offered. The scopes a client asks for are the ones it
              needs to work, so a half-granted token yields an application that
              fails later in a way nobody connects back to this screen. The
              decision is all of it or none of it, which is what the two buttons
              are for. */}
          <ul className="flex list-none flex-col gap-2 text-sm">
            {requested.map((scope) => (
              <li className="flex gap-2 text-muted-foreground" key={scope}>
                <span aria-hidden="true" className="select-none opacity-40">
                  &middot;
                </span>
                {scopeSentence(scope)}
                <input defaultValue={scope} name="grant_scope" type="hidden" />
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            {/* Explicit value: the primitive submits `value || ''`, so an
                omitted one arrives as an empty string and never matches. */}
            <Checkbox id="remember" name="remember" value="on" />
            <Label
              className="font-normal text-muted-foreground"
              htmlFor="remember"
            >
              Do not ask again for this application
            </Label>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              className="sm:flex-1"
              name="decision"
              type="submit"
              value="deny"
              variant="ghost"
            >
              Not now
            </Button>
            <Button
              className="sm:flex-1"
              name="decision"
              type="submit"
              value="accept"
            >
              Allow
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
