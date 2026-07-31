# plugin-framework

Shared plugin manifest/discovery/registry implementation for the cross-cutting concerns
described in `docs/10-reference/adr/ADR-0004-plugin-architecture.md` (email, SMS, secrets, storage, cloud,
identity providers, notification channels, UI themes, auth hooks) — implemented in Python per
`docs/10-reference/adr/ADR-0012-python-first-custom-tooling.md`, which supersedes ADR-0004's original
TypeScript/Go interface examples.

## What exists today

- `PluginManifest` — validated representation of an `integrations/email/<name>/plugin.json` file.
- `discover_plugins(plugins_dir, plugin_type)` — scans a directory for `plugin.json` manifests
  matching a given `type`, dynamically imports each one's `entry` module, and returns loaded
  entries.
- `PluginRegistry` — name -> loaded-plugin-factory map, with a `select(name)` lookup matching
  `configuration/platform.yaml`'s `<category>.provider: <plugin-name>` convention.

**Only the `email` category has a real plugin** (`integrations/email/smtp/`, used by `email-service`).
The other eight categories ADR-0004 lists have no implementations. Per the "no placeholders"
standard, this framework does not ship stub plugins for them — add a plugin when there's a real
second provider to justify the abstraction, the same way `email-smtp` justified this framework.

## Plugin manifest format

```json
{
  "name": "email-smtp",
  "version": "1.0.0",
  "type": "email",
  "description": "SMTP email provider",
  "entry": "provider:SmtpEmailProvider"
}
```

`entry` is `<module>:<attribute>` — the module is imported (its directory is added to
`sys.path` for the duration of the import) and the named attribute (a class or factory callable)
is returned to the caller, which is responsible for instantiating it with whatever
provider-specific config it needs (this framework does not prescribe a constructor signature).

## Using it in a service

```python
from pathlib import Path
from plugin_framework import PluginRegistry, discover_plugins

registry = PluginRegistry(discover_plugins(Path("/app/plugins"), plugin_type="email"))
provider_class = registry.select("email-smtp")
provider = provider_class(settings, logger)
```

See `platform/email-service/src/email_service/providers.py` for the real integration.
