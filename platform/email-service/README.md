# email-service

Sends email via a pluggable provider interface (`EmailProvider`, in `providers.py`). Only an SMTP
implementation exists, matching the pre-port implementation.

## Run locally

```bash
uv sync --all-groups
uv run uvicorn email_service.main:app --host 0.0.0.0 --port 8084
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```

## Endpoints

- `POST /send` — body `{"to": "...", "subject": "...", "html": "...", "text": "..."}`; 400 if
  `to`, `subject`, or both `html` and `text` are missing.
- `GET /healthz`

## Known gaps, preserved intentionally from the pre-port implementation

- **Only SMTP is implemented.** `EMAIL_PROVIDER` values other than `smtp` silently fall back to
  SMTP with a warning log — same behavior as before the port. `docs/10-reference/repository-audit.md` already
  flagged the missing SES/SendGrid/Mailgun/Resend providers `configuration/platform.yaml` advertises;
  implementing the rest of the provider ecosystem is the "plugin framework" work item, not part of
  this port.
- **No retry, outbox, idempotency, or template authorization** — unchanged from before the port.
