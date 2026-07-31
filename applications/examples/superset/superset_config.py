import os

from flask_appbuilder.security.manager import AUTH_OAUTH
from superset.security import SupersetSecurityManager

_base = os.environ.get("PLATFORM_BASE_URL", "http://localhost:4455").rstrip("/")

SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]
ENABLE_PROXY_FIX = True
PREFERRED_URL_SCHEME = "http"

AUTH_TYPE = AUTH_OAUTH
AUTH_USER_REGISTRATION = True
AUTH_USER_REGISTRATION_ROLE = "Gamma"
OAUTH_PROVIDERS = [{
    "name": "hydra",
    "token_key": "access_token",
    "icon": "fa-key",
    "remote_app": {
        "server_metadata_url": os.environ["OIDC_DISCOVERY_URL"],
        "client_id": "superset",
        "client_secret": os.environ["SUPERSET_OIDC_CLIENT_SECRET"],
        # flask-appbuilder passes this dict straight through to Authlib's
        # oauth.register() (confirmed by reading manager.py's source inside
        # the running image) — this platform's Hydra enforces PKCE on every
        # client, so code_challenge_method must be set explicitly here,
        # same pitfall as Open WebUI's OAUTH_CODE_CHALLENGE_METHOD.
        "client_kwargs": {"scope": "openid profile email", "code_challenge_method": "S256"},
        "redirect_uri": os.environ["OAUTH_CALLBACK_URL"],
        # Hydra's issuer (and therefore every URL server_metadata_url's
        # discovery document embeds) is the BROWSER-facing
        # http://localhost:4455 — correct for the authorize redirect, which
        # the browser follows, but unreachable from inside this container
        # for the token exchange and JWKS fetch, which Authlib makes
        # server-side (confirmed live: "Connection refused" against
        # localhost:4455 from this container). access_token_url here DOES
        # take precedence over the discovered document (confirmed live, the
        # token exchange succeeded once this was added) — jwks_uri does NOT
        # (confirmed live: still fetched localhost:4455 afterward), an
        # asymmetry in this Authlib version's precedence between the two
        # fields. See the load_server_metadata patch below for the actual
        # fix for jwks_uri.
        "access_token_url": "http://hydra:4444/oauth2/token",
        "jwks_uri": "http://hydra:4444/.well-known/jwks.json",
    },
}]


# Confirmed live (Authlib 1.3.2, reading flask_client.FlaskOAuth2App source
# inside the running image): load_server_metadata() does
# `self.server_metadata.update(metadata)` unconditionally on every fetch,
# which overwrites the `jwks_uri` passed at registration with the freshly
# discovered (browser-facing, unreachable from this container) value every
# time — the exact opposite of access_token_url, which Authlib checks as a
# dedicated attribute before ever consulting server_metadata, and which is
# why that override alone was NOT enough (confirmed live: token exchange
# succeeded once access_token_url was added, but the immediately-following
# ID-token signature verification still failed on jwks_uri). Patch the fetch
# itself so the rewrite can never be clobbered, regardless of Authlib's
# internal precedence for this one field.
from authlib.integrations.flask_client import FlaskOAuth2App  # noqa: E402

_original_load_server_metadata = FlaskOAuth2App.load_server_metadata


def _load_server_metadata_with_internal_jwks(self):
    metadata = _original_load_server_metadata(self)
    if self.name == "hydra":
        metadata["jwks_uri"] = "http://hydra:4444/.well-known/jwks.json"
        # Same class of bug, one endpoint further: CustomSecurityManager's
        # get_oauth_user_info() calls Authlib's .userinfo(), which also
        # reads userinfo_endpoint from this same metadata dict — confirmed
        # live, identical "Connection refused" against localhost:4455 after
        # the jwks fix got the flow past ID-token verification. Oathkeeper
        # DOES route /userinfo (hydra-userinfo-rules), but that's the
        # browser-facing path; this call is server-side, so go straight to
        # Hydra's public port over the Docker network, same as the others.
        metadata["userinfo_endpoint"] = "http://hydra:4444/userinfo"
    return metadata


FlaskOAuth2App.load_server_metadata = _load_server_metadata_with_internal_jwks


class CustomSecurityManager(SupersetSecurityManager):
    """flask-appbuilder's OAuth user-info parser only recognizes a fixed
    list of named providers (github/google/azure/okta/authentik/...) — a
    generic OIDC provider named anything else hits `OAuthProviderUnknown`
    with the response body swallowed (confirmed live: Superset's own log
    only showed "Error returning OAuth user info: " with no message).
    `get_oauth_user_info` is the documented override point for exactly
    this case (see its docstring in flask_appbuilder/security/manager.py).
    """

    def get_oauth_user_info(self, provider, resp):
        if provider == "hydra":
            # `.get("userinfo")` (the pattern flask-appbuilder's own
            # provider branches use for e.g. GitHub) treats "userinfo" as
            # a path relative to a configured api_base_url, which this
            # provider never sets (server_metadata_url is used instead,
            # discovered lazily) — confirmed live: "Invalid URL
            # 'userinfo': No scheme supplied". Authlib's own `.userinfo()`
            # resolves the discovered `userinfo_endpoint` correctly.
            me = self.oauth_remotes[provider].userinfo(token=resp)
            return {
                "username": me["sub"],
                "email": me.get("email"),
                "first_name": me.get("name", "") or "",
                "last_name": "",
            }
        return super().get_oauth_user_info(provider, resp)


CUSTOM_SECURITY_MANAGER = CustomSecurityManager
