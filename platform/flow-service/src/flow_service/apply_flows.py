"""One-shot CLI: apply every enabled flow's steps to the rendered
kratos.yaml (enable-only — see registry.py's docstring).

Runs as its own compose service (flows-render), after config-render's
envsubst pass and after identity-providers-render, before Kratos starts —
same one-shot pattern as both.
"""

from __future__ import annotations

import os
from pathlib import Path

from flow_service.registry import publish_to_rendered_config


def main() -> None:
    flows_dir = Path(os.environ.get("FLOWS_CONFIG_PATH", "/etc/config/flows"))
    rendered_kratos_config_path = Path(
        os.environ.get(
            "RENDERED_KRATOS_CONFIG_PATH",
            "/etc/config/kratos/config/rendered/ory/kratos/config/kratos.yaml",
        )
    )
    enabled_methods = publish_to_rendered_config(flows_dir, rendered_kratos_config_path)
    print(
        f"Applied {flows_dir} to {rendered_kratos_config_path}: enabled {sorted(enabled_methods)}"
    )


if __name__ == "__main__":
    main()
