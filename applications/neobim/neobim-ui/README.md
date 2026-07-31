# neobim-ui

**This is a sample business application, not the Identity Platform's own UI.**
The Identity Platform's UI lives at [`identity-ui/`](../../identity-ui) — this is a small
Next.js app that demonstrates a NeoBIM-branded product logging in via OIDC against Ory Hydra,
the same way Mealie, Superset, Airflow, and Open WebUI do (see the sibling `applications/*`
directories and `integrations/applications/neobim-ui.yaml`).

Registered as the `neobim-ui` OAuth2 client. Brought up via the optional
`docker-compose.applications.yml` stack (`make up-applications`), not the always-on baseline —
it's a demo/reference client, not something the platform depends on to function.

Do not confuse this with `identity-ui/`: that's the real, active Admin/User Portal every real
user and administrator interacts with. This directory is kept separate specifically so the two
are never conflated.
