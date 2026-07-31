#!/bin/sh
set -eu

# Renders every /templates/**/*.yaml.tmpl into /rendered/**/*.yaml (same
# relative path, .tmpl suffix stripped), substituting only the env vars
# named on each template's own placeholders — envsubst with an explicit
# variable list, so a literal '$' anywhere else in the YAML (there isn't
# one, but this is cheap insurance) is never touched.
#
# The SOCIAL_*_CLIENT_ID/SECRET vars were missing from this list entirely
# for a while — a real, previously-undiscovered gap: kratos.yaml.tmpl's OIDC
# providers reference these placeholders, but with them absent here,
# "envsubst" never touched them and stayed the literal, unexpanded string
# `${SOCIAL_GOOGLE_CLIENT_ID}` etc. forever — confirmed live by reading the
# actual rendered kratos.yaml. Kratos itself does not expand ${VAR} either
# (see docker-compose.yml's own comment on the kratos service), and has no
# Viper env-var override wired for nested provider-array fields — so there
# was no path at all for a real admin's real OAuth credentials (however
# placed in .env) to ever reach a running Kratos. Fixed; also needs these
# vars added to config-render's own `environment:` block in
# docker-compose.yml so they're actually set inside this container to
# substitute.
#
# Only google/microsoft remain (github/gitlab/apple's provider blocks and
# mapper .jsonnet files were removed from kratos.yaml.tmpl and
# ory/keto/mappers/ — the tech lead only wants these two providers wired at
# all, not just UI-hidden).
vars='${PLATFORM_BASE_URL} ${AUTH_UI_BASE_URL} ${APP_REGISTRY_BASE_URL}
${SOCIAL_GOOGLE_CLIENT_ID} ${SOCIAL_GOOGLE_CLIENT_SECRET}
${SOCIAL_MICROSOFT_CLIENT_ID} ${SOCIAL_MICROSOFT_CLIENT_SECRET} ${SOCIAL_MICROSOFT_TENANT}
${SELF_REGISTRATION_ENABLED}'

# -L + the '..*' path filter: Kubernetes ConfigMap volumes materialize as
# symlink trees (file -> ..data/file -> ..<timestamp>/file). Plain
# `find -type f` only matches the real file inside the timestamped dot-dir,
# so the preserved relative path becomes '..2026_.../<name>.yaml' and the
# consumer's `--config .../rendered/<name>.yaml` finds nothing (hit live on
# first k3s deploy — see docs/10-reference/ai-handoff.md §1.9). -L resolves the
# top-level symlink as a file; the filter drops the ..data/..timestamp
# duplicates. Compose bind mounts have no symlinks, so behavior there is
# unchanged.
find -L /templates -type f -name '*.yaml.tmpl' ! -path '*/..*' | while read -r src; do
  rel="${src#/templates/}"
  dest="/rendered/${rel%.tmpl}"
  mkdir -p "$(dirname "$dest")"
  envsubst "$vars" <"$src" >"$dest"
  echo "rendered ${rel} -> ${dest}"
done
