# One Cloud Run service exposes one port, so the admin APIs are their own services
# off the same images. They authenticate nobody, so ingress keeps them off any path
# beginning outside the VPC and IAM demands a token per call.
#
# hydra-admin has ingress only: Kratos resolves challenges against it with static
# headers, so with IAM enforced no login challenge resolved at all. Break-glass is
# one apply to INGRESS_TRAFFIC_ALL, which lands in the audit log.
module "kratos_admin" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "kratos-admin-${local.env}"
  port                  = 4434
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["kratos"].email
  ingress               = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  allow_public          = false
  # Two callers only, so a small ceiling keeps the connection budget honest.
  min_instances = 1
  max_instances = 4

  # One Kratos config across every deployment of it, so nothing diverges
  # silently; the args below are what differ, and what they leave out is
  # --watch-courier. Only kratos-courier runs the dispatcher.
  secret_files = {
    oidc = {
      secret    = google_secret_manager_secret.oidc_providers.secret_id
      file      = "providers.yml"
      mount_dir = "/etc/secrets/oidc"
    }
  }

  args = [
    "serve",
    "--config", "/etc/config/kratos/kratos.yml",
    "--config", "/etc/secrets/oidc/providers.yml",
  ]

  invokers = [
    "serviceAccount:${google_service_account.runtime["console"].email}",
    # apps/id, for account deletion only; see KRATOS_ADMIN_URL on that service.
    "serviceAccount:${google_service_account.runtime["id"].email}",
  ]

  env_vars = {
    LOG_LEVEL             = "info"
    SERVE_PUBLIC_BASE_URL = "https://${local.auth_host}/"
  }

  secret_env_vars = {
    DSN            = module.database.dsn_secret_ids["kratos"]
    SECRETS_COOKIE = "kratos-secrets-cookie"
    SECRETS_CIPHER = "kratos-secrets-cipher"
  }

  depends_on = [
    google_project_service.apis,
    # The mount reads `latest`, so the version and the grant have to exist
    # before the revision starts, and a module reference to the secret id alone
    # does not tell terraform that.
    google_secret_manager_secret_version.oidc_providers_placeholder,
    google_secret_manager_secret_iam_member.oidc_providers,
  ]
}

module "hydra_admin" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "hydra-admin-${local.env}"
  port                  = 4445
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["hydra"].email
  ingress               = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  # Ingress above is the only control, for the reason in the header. No invoker
  # list: allUsers subsumes one, and leaving the console and apps/id entries
  # beside it would read as IAM still deciding who gets in.
  allow_public  = true
  min_instances = 1
  max_instances = 4

  env_vars = {
    LOG_LEVEL        = "info"
    URLS_SELF_ISSUER = "https://${local.oauth_host}"
  }

  secret_env_vars = {
    DSN            = module.database.dsn_secret_ids["hydra"]
    SECRETS_SYSTEM = "hydra-secrets-system"
  }

  depends_on = [google_project_service.apis]
}
