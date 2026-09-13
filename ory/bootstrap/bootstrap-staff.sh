#!/bin/sh
# Creates the first staff identity with STAFF_ROLE written down rather than derived:
# the console's derived grant follows BOOTSTRAP_STAFF_EMAIL and leaves with it,
# while a written role stays with the person. Once per environment, idempotent, and
# it cannot enrol TOTP, which Kratos has no admin API for.
set -eu

: "${KRATOS_ADMIN_URL:?required}"
: "${STAFF_EMAIL:?required}"
STAFF_ROLE="${STAFF_ROLE:-superadmin}"
STAFF_FIRST="${STAFF_FIRST:-Marius}"
STAFF_LAST="${STAFF_LAST:-Bauer}"

# Kratos admin authenticates nobody, so Cloud Run IAM is the gate and the call
# needs a Google-signed token. Outside Cloud Run there is no metadata server and
# AUTH stays empty, which is right for a loopback admin port.
AUTH=""
token=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${KRATOS_ADMIN_URL}" 2>/dev/null || true)
if [ -n "$token" ]; then
  AUTH="Authorization: Bearer ${token}"
  echo "authenticating to ${KRATOS_ADMIN_URL} with a metadata identity token"
fi

found=$(curl -sf --get "${KRATOS_ADMIN_URL}/admin/identities" \
  ${AUTH:+-H "$AUTH"} \
  --data-urlencode "credentials_identifier=${STAFF_EMAIL}" 2>/dev/null) || found="[]"

existing=$(echo "$found" | jq -r '.[0].id // empty')
schema=$(echo "$found" | jq -r '.[0].schema_id // empty')

if [ -n "$existing" ]; then
  if [ "$schema" = "staff" ]; then
    echo "staff identity already exists for ${STAFF_EMAIL} (${existing}); leaving it alone"
    exit 0
  fi
  # The ordinary case: whoever stands an environment up signs in first and
  # self-service puts them on `default`. Nowhere else can perform the move, since
  # the console refuses a change to your own access and Kratos admin is
  # internal-only. By id, not a boolean, so the permission cannot outlive its
  # purpose: a boolean would migrate whatever the next STAFF_EMAIL found.
  if [ "${STAFF_MIGRATE_IDENTITY_ID:-}" = "$existing" ]; then
    echo "migrating ${existing} from schema '${schema}' to 'staff' with role ${STAFF_ROLE}"
    patched=$(curl -sf -X PATCH "${KRATOS_ADMIN_URL}/admin/identities/${existing}" \
      ${AUTH:+-H "$AUTH"} \
      -H 'Content-Type: application/json' \
      -d "[
            {\"op\": \"replace\", \"path\": \"/schema_id\", \"value\": \"staff\"},
            {\"op\": \"replace\", \"path\": \"/metadata_public\", \"value\": {\"staffRole\": \"${STAFF_ROLE}\"}}
          ]" 2>/dev/null) || patched=""
    if [ -z "$patched" ]; then
      echo "ERROR: the patch was refused; ${existing} is unchanged." >&2
      exit 1
    fi
    echo "migrated ${existing}: schema 'staff', staffRole ${STAFF_ROLE}"
    exit 0
  fi
  # Refuse loudly rather than mutating an identity that may be a real tenant
  # account. Traits carry across unchanged, so the migration is reversible by the
  # same patch in the other direction, but it is still somebody's account.
  echo "ERROR: ${STAFF_EMAIL} already exists as ${existing} on schema '${schema}', not 'staff'." >&2
  echo "  A tenant account and a staff account cannot share an email in one deployment:" >&2
  echo "  the credentials index is unique per (identifier, type) regardless of schema." >&2
  echo "  If this is the account that should hold console access, re-run with" >&2
  echo "  STAFF_MIGRATE_IDENTITY_ID=${existing}, which patches the schema and the" >&2
  echo "  role and leaves credentials and traits alone. Otherwise use a different" >&2
  echo "  address." >&2
  exit 1
fi

# Email pre-verified: the operator has to receive a login code at this address
# to get in at all, so a separate verification round trip proves nothing.
created=$(curl -sf -X POST "${KRATOS_ADMIN_URL}/admin/identities" \
  ${AUTH:+-H "$AUTH"} \
  -H 'Content-Type: application/json' \
  -d "{
        \"schema_id\": \"staff\",
        \"traits\": {
          \"email\": \"${STAFF_EMAIL}\",
          \"name\": { \"first\": \"${STAFF_FIRST}\", \"last\": \"${STAFF_LAST}\" }
        },
        \"metadata_public\": { \"staffRole\": \"${STAFF_ROLE}\" },
        \"verifiable_addresses\": [
          { \"value\": \"${STAFF_EMAIL}\", \"verified\": true, \"via\": \"email\", \"status\": \"completed\" }
        ]
      }")

echo "created staff identity for ${STAFF_EMAIL} with staffRole=${STAFF_ROLE}"
echo "  id: $(echo "$created" | jq -r '.id')"
echo "next: sign in at the sign-in app with an email code, then enrol TOTP in settings — the console requires aal2"
