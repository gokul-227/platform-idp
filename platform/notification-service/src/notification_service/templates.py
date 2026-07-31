"""Read/write for Kratos's real courier email templates
(ory/kratos/email-templates/<flow>/<state>.<kind>.gotmpl) — the actual
files kratos.yaml.tmpl's courier.templates section points at via
file:///etc/config/kratos/email-templates/... Editing these through this
service is the same file Kratos's courier reads on every send; no
restart needed (confirmed live — see the console's Notifications page
description and this session's final report for the verification).
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

_FILENAME_SUFFIX = ".gotmpl"


class TemplateNotFoundError(Exception):
    def __init__(self, template_id: str) -> None:
        super().__init__(f"Unknown template: {template_id}")
        self.template_id = template_id


class Template(BaseModel):
    id: str
    flow: str
    state: str
    kind: str
    content: str


def _parse_filename(filename: str) -> tuple[str, str] | None:
    if not filename.endswith(_FILENAME_SUFFIX):
        return None
    stem = filename[: -len(_FILENAME_SUFFIX)]
    parts = stem.split(".")
    if len(parts) != 2:
        return None
    state, kind = parts
    if kind not in ("html", "plaintext", "subject"):
        return None
    return state, kind


def _template_path(templates_dir: Path, template_id: str) -> Path:
    try:
        flow, state, kind = template_id.split(".")
    except ValueError as error:
        raise TemplateNotFoundError(template_id) from error
    return templates_dir / flow / f"{state}.{kind}{_FILENAME_SUFFIX}"


def list_templates(templates_dir: Path) -> list[Template]:
    if not templates_dir.exists():
        return []
    templates = []
    for flow_dir in sorted(templates_dir.iterdir()):
        if not flow_dir.is_dir():
            continue
        for file_path in sorted(flow_dir.iterdir()):
            parsed = _parse_filename(file_path.name)
            if parsed is None:
                continue
            state, kind = parsed
            templates.append(
                Template(
                    content=file_path.read_text(encoding="utf-8"),
                    flow=flow_dir.name,
                    id=f"{flow_dir.name}.{state}.{kind}",
                    kind=kind,
                    state=state,
                )
            )
    return templates


def get_template(templates_dir: Path, template_id: str) -> Template:
    path = _template_path(templates_dir, template_id)
    if not path.exists():
        raise TemplateNotFoundError(template_id)
    flow, state, kind = template_id.split(".")
    return Template(
        content=path.read_text(encoding="utf-8"), flow=flow, id=template_id, kind=kind, state=state
    )


def update_template(templates_dir: Path, template_id: str, content: str) -> Template:
    path = _template_path(templates_dir, template_id)
    if not path.exists():
        raise TemplateNotFoundError(template_id)
    path.write_text(content, encoding="utf-8")
    flow, state, kind = template_id.split(".")
    return Template(content=content, flow=flow, id=template_id, kind=kind, state=state)
