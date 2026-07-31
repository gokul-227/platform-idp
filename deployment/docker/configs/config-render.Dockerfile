# =============================================================================
# Config Renderer — envsubst wrapper for Ory YAML templates
# =============================================================================
# Kratos/Hydra/Oathkeeper do not expand ${VAR} inside their own YAML config
# files (confirmed across v1.2.0/v2.2.0/v0.40.6 — see docs/10-reference/adr/ADR-0013 and
# docs/10-reference/ai-handoff.md §1.6 item 3). Browser-facing URLs in those configs (the
# ones a client actually hits — Oathkeeper's proxy address, the auth UI's
# address) still need to be configurable via env var, since they change
# whenever OATHKEEPER_PROXY_PORT/AUTH_UI_PORT/etc. are overridden. This image
# renders `*.yaml.tmpl` files with envsubst into a shared volume before the
# dependent Ory service starts — see deployment/docker/configs/config-render-entrypoint.sh.
# =============================================================================
FROM alpine:3.19
RUN apk add --no-cache gettext
COPY deployment/docker/configs/config-render-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
