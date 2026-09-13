# Google and Microsoft sign-in

## The callback URL

The one value that must match exactly. It points at **Kratos**, not at the app:
Kratos exchanges the authorization code and mints the session, and the app never
sees the upstream token. The last segment is the provider **`id`** in the config,
not the provider type.

| Environment | Callback |
| --- | --- |
| local | `http://localhost:4433/self-service/methods/oidc/callback/<id>` |
| dev | `https://auth.dev.id.os.build/self-service/methods/oidc/callback/<id>` |
| test | `https://auth.test.id.os.build/self-service/methods/oidc/callback/<id>` |
| prod | `https://auth.id.os.build/self-service/methods/oidc/callback/<id>` |

One registration per environment. A shared registration means one secret whose
expiry takes down prod and dev together, and a leaked dev secret is a prod
credential. Local shares the dev registration by adding the `localhost` callback
to it, since `localhost` is only reachable from a developer's machine.

## Microsoft (Entra)

Identity → Anwendungen → App-Registrierungen → **Neue Registrierung**.

- **Unterstützte Kontotypen** must be the widest audience you might ever want,
  because Kratos can narrow it but never widen it. With registration open to any
  email address, that is the third option (`…mehrinstanzenfähig… und persönliche
  Microsoft-Konten`) and `microsoft_tenant: common`.

  | Portal selection | `microsoft_tenant` |
  | --- | --- |
  | Nur dieses Organisationsverzeichnis (einzelner Mandant) | the directory id |
  | Beliebiges Organisationsverzeichnis (mehrinstanzenfähig) | `organizations` |
  | …mehrinstanzenfähig… und persönliche Microsoft-Konten | `common` |

- **Umleitungs-URI**: platform **Web**. Not SPA: Kratos exchanges the code with a
  client secret, and Entra refuses a secret from an SPA registration.
- **Übersicht** → **Anwendungs-(Client-)ID** is the `client_id`. A GUID, 36
  characters. If the value you have contains a `~` and is around 40 characters,
  it is a secret, not an id.
- **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel** → copy **Wert**
  immediately. Afterwards only the secret *id* is readable, which is useless.
  Note the expiry: when it lapses every Microsoft sign-in fails at once, and
  nothing in our logs says "expired secret".
- **Token-Konfiguration → Optionalen Anspruch hinzufügen → ID**: add `email` and
  `xms_edov`. Without `email`, accounts whose directory has no `mail` attribute
  (guests, UPN-only tenants) send no email claim, the mapper maps nothing, and
  the identity fails schema validation with an error that never mentions email.
- **Authentifizierung**: implicit-flow checkboxes off, public client flows off.
- **Branding & Eigenschaften → Herausgeberdomäne** for multitenant, or every
  other tenant sees "unverifiziert" on the consent screen.

No API permissions to configure: `openid`, `profile` and `email` are granted by
default, and Kratos reads claims from the ID token rather than calling Graph.

### AADSTS700016

"Application with identifier X was not found in the directory Y." Two causes,
and the second is the surprising one:

1. The registration lives in a different directory than the account signing in.
2. **`microsoft_tenant: common` against a single-tenant registration.** `/common`
   performs a multi-tenant lookup, and a single-tenant app has no service
   principal outside its own directory, so the lookup misses even when the user
   belongs to the app's tenant. Either widen the registration, or pin
   `microsoft_tenant` to the directory id.

A registration change replicates for a few minutes, and 700016 is what you see
during that window, so retest after a pause rather than changing something else.

Note that Entra does not send `email_verified`, and a work account's `mail`
attribute is a field its own administrator controls. `xms_edov` is Microsoft's
signal for whether the address is on a domain that tenant proved it owns, which
is why it is worth collecting even before the mapper enforces it.

## Google

Google Cloud Console → APIs & Services → Credentials → **OAuth client ID**, type
**Web application**, same callback with `/google`.

The consent screen is configured **per project**, and verification is a
per-project process. Putting all three clients in `platform-id-shared` avoids
doing it three times, which is the opposite of the Entra recommendation and only
because Google couples consent to the project.

## Where the credentials go

Kratos takes `providers` as a **list**, and Ory's environment overrides address
config paths, not list elements. So there is no `..._PROVIDERS_1_CLIENT_SECRET`,
and the whole array has to arrive as a config file.

**Locally**: `ory/kratos/kratos.local.yml`, gitignored, loaded by compose as a
second `--config` after `kratos.yml`. Copy `kratos.local.example.yml`.

**Deployed**: the `kratos-oidc-providers` secret per project, mounted at
`/etc/secrets/oidc/providers.yml` and passed as a second `--config` to both the
public and the admin Kratos service.

`ory/kratos/oidc.providers.template.yml` is the whole file, with the four values
that differ per environment left as `${...}`. Terraform seeds it verbatim, so a
fresh environment boots with the buttons rendering and failing on click. Then
`sync-secrets.yml` renders it with that environment's two client ids and two
client secrets, which are already GitHub variables and secrets, and writes the
result as a new version:

```
gh workflow run sync-secrets.yml -f environment=<env>
```

So changing a provider, a scope or a mapper is a reviewed diff plus one dispatch.
Nothing is hand-edited per project, which is what made it impossible to tell
whether two environments held the same config. An unset value or a surviving
marker stops the run rather than shipping it: a marker that reaches Google comes
back as `invalid_client`, which reads as a wrong credential rather than a missing
one.

Cloud Run reads `latest`, so a later apply never reverts it. The render step is
deliberately not on the deploy path, because the identity that runs a deploy can
add a version but not read one back to compare, and a new version of this file on
every merge is not a rotation.

**A later config replaces the array wholesale.** Verified against a running
Kratos: injecting a file with only `microsoft` left `google` gone entirely. Any
override must therefore list every provider that environment offers, including
ones whose credentials are not secret.

The root `.env` also has `GOOGLE_*` and `MICROSOFT_*` entries. Nothing reads
them; they are a holding place while registering upstream, and the values still
have to be copied into the files above.
