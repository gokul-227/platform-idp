# notification-service

Routes notifications to a channel-specific backend: `email` is forwarded to `email-service`'s
`POST /send`; `sms` is mocked.

## Run locally

```bash
uv sync --all-groups
uv run uvicorn notification_service.main:app --host 0.0.0.0 --port 8085
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```

## Endpoints

- `POST /dispatch` — body `{"recipient": "...", "channel": "email"|"sms", "message": "...",
  "title": "..."}`; 400 if `recipient`, `channel`, or `message` is missing, or if `channel` isn't
  `email`/`sms`.
- `GET /healthz`

## Changes from the pre-port implementation

- **HTML-escapes `message` before interpolating it into the email body** (`<p>{message}</p>`).
  The original interpolated it unescaped — flagged in `docs/10-reference/repository-audit.md` as an HTML/XSS
  injection risk into outgoing email. Fixed as part of the port since it doesn't change the
  external contract (same fields, same response shape), only makes the generated HTML safe.
- **This service never had a Dockerfile or Compose entry** (`docs/10-reference/repository-audit.md`: "has no
  Dockerfile and is not composed"). Both now exist, since `email-service` (which this service
  depends on for the `email` channel) is also now composed.

## Known gap, preserved intentionally from the pre-port implementation

`sms` delivery is mocked and always reports success without ever attempting delivery — this was
true before the port, and the original code's own comment already deferred a real implementation
to "Phase 6" (the plugin framework / SMS provider work).
