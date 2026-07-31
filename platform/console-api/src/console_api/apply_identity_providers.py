"""One-shot CLI: filter the rendered kratos.yaml's OIDC providers list down
to what configuration/identity-providers.yaml marks enabled.

Runs as its own compose service (identity-providers-render), after
config-render's envsubst pass and before Kratos starts — config-render
can't do this itself (plain envsubst has no conditional logic). Not a long-
running server; same one-shot pattern as config-render itself.
"""

from __future__ import annotations

import os
from pathlib import Path

from console_api.identity_providers import apply_to_rendered_config


def main() -> None:
    providers_path = Path(
        os.environ.get("IDENTITY_PROVIDERS_PATH", "/etc/config/identity-providers.yaml")
    )
    rendered_kratos_config_path = Path(
        os.environ.get(
            "RENDERED_KRATOS_CONFIG_PATH",
            "/etc/config/kratos/config/rendered/ory/kratos/config/kratos.yaml",
        )
    )
    apply_to_rendered_config(providers_path, rendered_kratos_config_path)
    print(f"Applied {providers_path} to {rendered_kratos_config_path}")


if __name__ == "__main__":
    main()
