#!/usr/bin/env bash
# Grant a Kratos identity view access to an application plugin resource.
# Usage: grant-app-access.sh <app-name> <kratos-identity-uuid>
set -euo pipefail

app="${1:?app name (jupyterhub|superset|airflow)}"
subject="${2:?kratos identity id (uuid)}"
keto_write="${KETO_WRITE_URL:-http://localhost:4467}"

payload=$(printf '{"namespace":"Resource","object":"%s","relation":"view","subject_id":"%s"}' "$app" "$subject")

if command -v curl >/dev/null 2>&1; then
  curl -sf -X PUT "${keto_write}/admin/relation-tuples" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null
else
  python3 - <<PY
import json, os, urllib.request
payload = json.loads("""$payload""")
req = urllib.request.Request(
    f"{os.environ.get('KETO_WRITE_URL', 'http://localhost:4467')}/admin/relation-tuples",
    data=json.dumps(payload).encode(),
    method="PUT",
    headers={"Content-Type": "application/json"},
)
urllib.request.urlopen(req)
PY
fi

printf 'Granted Resource:%s#view to subject %s\n' "$app" "$subject"
