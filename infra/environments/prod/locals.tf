locals {
  env = "prod"

  # prod is the zone apex; non-prod sits under its own label.
  base = var.domain

  # Public hostnames. The three Ory public surfaces are separate hosts so the
  # issuer never moves once tokens name it, and each app answers on its own.
  id_host      = local.base              # sign-in app (apps/id)
  console_host = "console.${local.base}" # operator console (apps/console)
  auth_host    = "auth.${local.base}"    # Kratos public (self-service flows)
  oauth_host   = "oauth.${local.base}"   # Hydra public (OIDC issuer)

  registry = "${var.region}-docker.pkg.dev/${var.project}/id"
}
