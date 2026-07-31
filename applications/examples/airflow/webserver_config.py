import os

from airflow.www.security import AirflowSecurityManager
from flask_appbuilder.security.manager import AUTH_OAUTH

_base = os.environ.get("PLATFORM_BASE_URL", "http://localhost:4455").rstrip("/")

AUTH_TYPE = AUTH_OAUTH
AUTH_USER_REGISTRATION = True
AUTH_USER_REGISTRATION_ROLE = "Viewer"
OAUTH_PROVIDERS = [{
    "name": "hydra",
    "token_key": "access_token",
    "icon": "fa-key",
    "remote_app": {
        "server_metadata_url": os.environ["OIDC_DISCOVERY_URL"],
        "client_id": "airflow",
        "client_secret": os.environ["AIRFLOW_OIDC_CLIENT_SECRET"],
        # This platform's Hydra enforces PKCE for every client — same
        # pitfall found with Open WebUI/Superset, confirmed again here.
        "client_kwargs": {"scope": "openid profile email", "code_challenge_method": "S256"},
        "redirect_uri": os.environ["OAUTH_CALLBACK_URL"],
        # Same fix as applications/examples/superset/superset_config.py's identical
        # comment: access_token_url is a dedicated Authlib attribute checked
        # before server_metadata, so this override alone is enough for the
        # token exchange. jwks_uri/userinfo_endpoint are NOT — see the
        # load_server_metadata patch below for those two.
        "access_token_url": "http://hydra:4444/oauth2/token",
        "jwks_uri": "http://hydra:4444/.well-known/jwks.json",
    },
}]

# Confirmed live in applications/examples/superset/superset_config.py first (same
# Flask-AppBuilder/Authlib stack, same Hydra provider) — see that file's
# comment for the full root-cause explanation. load_server_metadata()
# unconditionally overwrites the registered jwks_uri/userinfo_endpoint with
# the freshly discovered, browser-facing (unreachable from this container)
# values on every fetch; patching the fetch itself is the only fix that
# actually holds.
from authlib.integrations.flask_client import FlaskOAuth2App  # noqa: E402

_original_load_server_metadata = FlaskOAuth2App.load_server_metadata


def _load_server_metadata_with_internal_jwks(self):
    metadata = _original_load_server_metadata(self)
    if self.name == "hydra":
        metadata["jwks_uri"] = "http://hydra:4444/.well-known/jwks.json"
        metadata["userinfo_endpoint"] = "http://hydra:4444/userinfo"
    return metadata


FlaskOAuth2App.load_server_metadata = _load_server_metadata_with_internal_jwks


class CustomSecurityManager(AirflowSecurityManager):
    """Same fix as applications/examples/superset/superset_config.py: Flask-AppBuilder
    (which Airflow's webserver security manager is built on) only parses
    OAuth userinfo for a fixed list of named providers — a generic
    provider named "hydra" hits OAuthProviderUnknown. get_oauth_user_info
    is Flask-AppBuilder's own documented override point for this case.
    """

    def get_oauth_user_info(self, provider, resp):
        if provider == "hydra":
            me = self.oauth_remotes[provider].userinfo(token=resp)
            return {
                "username": me["sub"],
                "email": me.get("email"),
                "first_name": me.get("name", "") or "",
                "last_name": "",
            }
        return super().get_oauth_user_info(provider, resp)


SECURITY_MANAGER_CLASS = CustomSecurityManager
