from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture
def plugins_dir(tmp_path: Path) -> Path:
    plugin_dir = tmp_path / "widget-basic"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "name": "widget-basic",
                "version": "1.0.0",
                "type": "widget",
                "description": "A basic widget",
                "entry": "provider:Widget",
            }
        ),
        encoding="utf-8",
    )
    (plugin_dir / "provider.py").write_text("class Widget:\n    kind = 'basic'\n", encoding="utf-8")
    return tmp_path
