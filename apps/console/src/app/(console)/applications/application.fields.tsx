import { Checkbox } from "@aec-craft/ui/components/primitives/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@aec-craft/ui/components/primitives/field";
import { Input } from "@aec-craft/ui/components/primitives/input";
import { Switch } from "@aec-craft/ui/components/primitives/switch";
import { Textarea } from "@aec-craft/ui/components/primitives/textarea";
import type { ReactNode } from "react";
import { GRANT_TYPES } from "./application.grants";

export interface ApplicationDefaults {
  audience: readonly string[];
  grantTypes: readonly string[];
  postLogoutRedirectUris: readonly string[];
  redirectUris: readonly string[];
  scope: string;
  skipConsent: boolean;
}

/**
 * The fields the create and the edit form both carry, so the grant list and its
 * wording cannot drift between registering an application and changing one.
 * Everything decided once, at registration (client type, owner), stays with the
 * create form.
 */
export function ApplicationFields({
  defaults,
}: {
  defaults: ApplicationDefaults;
}): ReactNode {
  return (
    <>
      {/* Consent tracks who owns the app, not whether it keeps a secret:
          a first-party SPA should skip it, a third-party server app must
          not. Off by default, so skipping is always a deliberate act. */}
      <Field orientation="horizontal">
        <Switch
          defaultChecked={defaults.skipConsent}
          id="skip_consent"
          name="skip_consent"
          value="true"
        />
        <FieldContent>
          <FieldLabel htmlFor="skip_consent">Skip consent</FieldLabel>
          <FieldDescription>
            For first-party apps: the user is signing in to us, not granting a
            third party access. Leave off for anyone else&apos;s app.
          </FieldDescription>
        </FieldContent>
      </Field>

      <FieldSet>
        <FieldLegend>Grant types</FieldLegend>
        <FieldGroup className="gap-3">
          {GRANT_TYPES.map((grant) => (
            <Field key={grant.value} orientation="horizontal">
              <Checkbox
                defaultChecked={defaults.grantTypes.includes(grant.value)}
                id={`grant-${grant.value}`}
                name="grant_types"
                value={grant.value}
              />
              <FieldContent>
                <FieldLabel
                  className="font-mono text-xs"
                  htmlFor={`grant-${grant.value}`}
                >
                  {grant.value}
                </FieldLabel>
                <FieldDescription>{grant.description}</FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      <Field>
        <FieldLabel htmlFor="redirect_uris">Redirect URIs</FieldLabel>
        <Textarea
          className="min-h-20 font-mono text-xs"
          defaultValue={defaults.redirectUris.join("\n")}
          id="redirect_uris"
          name="redirect_uris"
        />
        <FieldDescription>
          Exact-match allowlist, one per line. Required for authorization_code.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="post_logout_redirect_uris">
          Sign-out redirect URIs
        </FieldLabel>
        <Textarea
          className="min-h-20 font-mono text-xs"
          defaultValue={defaults.postLogoutRedirectUris.join("\n")}
          id="post_logout_redirect_uris"
          name="post_logout_redirect_uris"
        />
        <FieldDescription>
          Where the application may send someone after signing out, one per line
          and matched whole. An unlisted one fails the sign-out rather than the
          sign-in, so it is missed until somebody tries to leave.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="audience">Audience</FieldLabel>
        <Textarea
          className="min-h-20 font-mono text-xs"
          defaultValue={defaults.audience.join("\n")}
          id="audience"
          name="audience"
        />
        <FieldDescription>
          The APIs this application may obtain a token for, one URL per line. An
          API verifies that its own URL is in the token, so an audience it was
          never granted is refused. Empty means the application can sign someone
          in and call nothing.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="scope">Scope</FieldLabel>
        <Input defaultValue={defaults.scope} id="scope" name="scope" />
        <FieldDescription>
          Ceiling on what the client may request, space-separated.
        </FieldDescription>
      </Field>
    </>
  );
}
