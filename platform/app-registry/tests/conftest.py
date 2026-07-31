from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO_ROOT / "configuration" / "schemas" / "app-registry.schema.json"

VALID_DEFINITION = """
client_id: test-app
client_name: Test Application
redirect_uris:
  - http://localhost:4455/auth/callback
grant_types:
  - authorization_code
  - refresh_token
scope: openid profile email
client_secret_env_var: TEST_APP_OIDC_CLIENT_SECRET
enabled: true
tenant_id: default
tags:
  - test
"""

DISABLED_DEFINITION = """
client_id: disabled-app
client_name: Disabled Application
redirect_uris:
  - http://localhost:4455/auth/callback
grant_types:
  - authorization_code
scope: openid
enabled: false
"""


@pytest.fixture
def schema_path() -> Path:
    return SCHEMA_PATH


@pytest.fixture
def registry_dir(tmp_path: Path) -> Path:
    (tmp_path / "test-app.yaml").write_text(VALID_DEFINITION, encoding="utf-8")
    (tmp_path / "disabled-app.yaml").write_text(DISABLED_DEFINITION, encoding="utf-8")
    (tmp_path / "_template.yaml").write_text(VALID_DEFINITION, encoding="utf-8")
    return tmp_path
