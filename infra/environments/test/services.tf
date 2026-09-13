# ── Ory services ─────────────────────────────────────────────────────────────
# Admin surfaces are unauthenticated by design, so only the public ports get a
# host rule on the load balancer.
module "kratos" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "kratos-${local.env}"
  port                  = 4433
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["kratos"].email
  cloud_sql_instance    = module.database.connection_name
  min_instances         = 1
  max_instances         = 10
  allow_public          = true
  # No courier here: it is its own service below, so this one may scale.

  # The providers list arrives as a second --config: see secrets.tf.
  secret_files = {
    oidc = {
      secret    = google_secret_manager_secret.oidc_providers.secret_id
      file      = "providers.yml"
      mount_dir = "/etc/secrets/oidc"
    }
  }

  # Overrides the image CMD wholesale, which is how --watch-courier is dropped:
  # the dispatcher is its own service below, and two of them would race for the
  # same queue. Repeating the --config paths is the cost of that override.
  args = [
    "serve",
    "--config", "/etc/config/kratos/kratos.yml",
    "--config", "/etc/secrets/oidc/providers.yml",
  ]

  env_vars = {
    LOG_LEVEL = "info"
    # No trailing slash, for tidiness only. Kratos serves one OIDC callback for
    # every provider, /self-service/methods/oidc/callback, and tells them apart
    # by `state`, so this value does not decide what upstreams must register.
    SERVE_PUBLIC_BASE_URL = "https://${local.auth_host}"
    SERVE_ADMIN_BASE_URL  = module.kratos_admin.uri
    # The browser callers. Left unset the deployed list was the committed
    # local-dev one, which named localhost as a credentialed origin and
    # omitted every real host.
    SERVE_PUBLIC_CORS_ALLOWED_ORIGINS                         = join(",", ["https://${local.id_host}", "https://${local.console_host}"])
    SELFSERVICE_DEFAULT_BROWSER_RETURN_URL                    = "https://${local.id_host}/account"
    SELFSERVICE_ALLOWED_RETURN_URLS                           = "https://${local.id_host},https://${local.oauth_host},https://${local.console_host}"
    SELFSERVICE_FLOWS_LOGIN_UI_URL                            = "https://${local.id_host}/login"
    SELFSERVICE_FLOWS_REGISTRATION_UI_URL                     = "https://${local.id_host}/registration"
    SELFSERVICE_FLOWS_RECOVERY_UI_URL                         = "https://${local.id_host}/recovery"
    SELFSERVICE_FLOWS_VERIFICATION_UI_URL                     = "https://${local.id_host}/verification"
    SELFSERVICE_FLOWS_SETTINGS_UI_URL                         = "https://${local.id_host}/account"
    SELFSERVICE_FLOWS_ERROR_UI_URL                            = "https://${local.id_host}/error"
    SELFSERVICE_FLOWS_LOGOUT_AFTER_DEFAULT_BROWSER_RETURN_URL = "https://${local.id_host}/login"
    # Hydra admin root, not the public host: Kratos resolves login and consent
    # challenges against the admin API, and its embedded Hydra SDK appends the
    # /admin/... path itself, so a suffix here doubles into /admin/admin/.
    OAUTH2_PROVIDER_URL = module.hydra_admin.uri
    # Host-only cookies are the default, and the app is on another host: without
    # this it never receives them, cannot forward them, and bounces between
    # minting flows for ever. Locally this passes only because both are localhost.
    COOKIES_DOMAIN        = local.base
    SESSION_COOKIE_DOMAIN = local.base
    # Not derived from the hostname: the provider refuses an unverified sender
    # with 550 after Kratos has queued the message and the UI has said a code
    # was sent. DNS for this domain is published from environments/shared.
    COURIER_SMTP_FROM_ADDRESS = var.mail_from_address
    COURIER_SMTP_FROM_NAME    = "buildOS"
  }

  secret_env_vars = {
    DSN                         = module.database.dsn_secret_ids["kratos"]
    SECRETS_COOKIE              = "kratos-secrets-cookie"
    SECRETS_CIPHER              = "kratos-secrets-cipher"
    COURIER_SMTP_CONNECTION_URI = "courier-smtp-connection-uri"
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

module "hydra" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "hydra-${local.env}"
  port                  = 4444
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["hydra"].email
  cloud_sql_instance    = module.database.connection_name
  min_instances         = 1
  max_instances         = 10
  allow_public          = true

  env_vars = {
    LOG_LEVEL                        = "info"
    URLS_SELF_ISSUER                 = "https://${local.oauth_host}"
    URLS_SELF_PUBLIC                 = "https://${local.oauth_host}"
    URLS_LOGIN                       = "https://${local.id_host}/login"
    URLS_CONSENT                     = "https://${local.id_host}/consent"
    URLS_LOGOUT                      = "https://${local.id_host}/logout"
    URLS_POST_LOGOUT_REDIRECT        = "https://${local.id_host}/login"
    URLS_IDENTITY_PROVIDER_PUBLICURL = "https://${local.auth_host}"
    # Only origins that redeem a code in the browser. compact() drops the
    # platform API when that estate has none registered.
    SERVE_PUBLIC_CORS_ALLOWED_ORIGINS = join(",", compact(concat(["https://${local.id_host}"], split(",", var.oauth_browser_origins))))
    # No client_registration_url on purpose. It is a separate switch from
    # oidc.dynamic_client_registration.enabled: with the flag off and this set,
    # discovery still advertises a registration_endpoint that answers 404.
    #
    # Asked on every refresh grant, so the claims a resource server gates on are
    # re-derived from the identity rather than replayed from consent: a revoked
    # role stops travelling within one access-token lifetime instead of at the
    # end of the refresh chain. Here rather than in `hydra.yml` because the URL
    # is per environment and the value beside it is a secret.
    OAUTH2_REFRESH_TOKEN_HOOK_URL              = "https://${local.id_host}/api/internal/refresh"
    OAUTH2_REFRESH_TOKEN_HOOK_AUTH_TYPE        = "api_key"
    OAUTH2_REFRESH_TOKEN_HOOK_AUTH_CONFIG_IN   = "header"
    OAUTH2_REFRESH_TOKEN_HOOK_AUTH_CONFIG_NAME = "X-Refresh-Hook-Token"
  }

  secret_env_vars = {
    DSN                                    = module.database.dsn_secret_ids["hydra"]
    SECRETS_SYSTEM                         = "hydra-secrets-system"
    OIDC_SUBJECT_IDENTIFIERS_PAIRWISE_SALT = "hydra-pairwise-salt"
    # The value Hydra presents on the header named above.
    OAUTH2_REFRESH_TOKEN_HOOK_AUTH_CONFIG_VALUE = "refresh-hook-secret"
  }

  depends_on = [google_project_service.apis]
}

# Neither port is routed by the load balancer: no hostname, reached by service
# URL. Both refuse an unauthenticated caller, so the LB was a route and never a
# control.
module "keto" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "keto-read-${local.env}"
  port                  = 4466
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["keto"].email
  cloud_sql_instance    = module.database.connection_name
  min_instances         = 1
  max_instances         = 8
  # IAM is the control, ingress is open: the caller is the platform API in
  # another project, so it arrives as external traffic no VPC placement admits,
  # and it can mint a Google-signed token.
  ingress      = "INGRESS_TRAFFIC_ALL"
  allow_public = false

  invokers = compact([
    var.platform_api_service_account == "" ? "" : "serviceAccount:${var.platform_api_service_account}",
  ])

  env_vars = { LOG_LEVEL = "info" }

  secret_env_vars = {
    DSN = module.database.dsn_secret_ids["keto"]
  }

  depends_on = [google_project_service.apis]
}

# The write API manages tuples, so it is as privileged as any admin surface.
module "keto_write" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "keto-write-${local.env}"
  port                  = 4467
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["keto"].email
  cloud_sql_instance    = module.database.connection_name
  min_instances         = 1
  max_instances         = 4
  # Same arrangement as keto-read, same caller. IAM is the whole control here,
  # which this surface requires: anonymous invocation would leave the VPC
  # boundary between anything in the project and granting itself owners.
  ingress      = "INGRESS_TRAFFIC_ALL"
  allow_public = false

  invokers = compact([
    var.platform_api_service_account == "" ? "" : "serviceAccount:${var.platform_api_service_account}",
  ])

  env_vars = { LOG_LEVEL = "info" }

  secret_env_vars = {
    DSN = module.database.dsn_secret_ids["keto"]
  }

  depends_on = [google_project_service.apis]
}

# ── Next apps ────────────────────────────────────────────────────────────────
module "id" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "id-${local.env}"
  port                  = 3000
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["id"].email
  allow_public          = true
  min_instances         = 1

  env_vars = merge({
    NODE_ENV = "production"
    # Kratos frontend and Hydra admin (the consent contract requires accepting
    # the challenge); no Kratos admin. The LB hostname, not the run.app URL:
    # the two must agree or a flow starts on one host and continues on another.
    KRATOS_PUBLIC_URL              = "https://${local.auth_host}"
    NEXT_PUBLIC_KRATOS_BROWSER_URL = "https://${local.auth_host}"
    HYDRA_ADMIN_URL                = module.hydra_admin.uri
    # Origins a Back link in this app may point at. Separate from Kratos\'s
    # own allowed_return_urls, which only governs its redirects.
    ALLOWED_RETURN_ORIGINS = "https://${local.console_host}"
    # For one call, closing your own account, which Kratos has no self-service
    # flow for. `account.deletion.ts` keeps the client private and takes the
    # subject from the session.
    KRATOS_ADMIN_URL = module.kratos_admin.uri
    # Told before the identity goes, and it may refuse: the platform will not
    # leave an organization or project without an owner.
    PLATFORM_API_URL = var.platform_api_url
    # Who may sign themselves up. Not a bound on what an identity may be: the
    # console creates on any domain either way.
    REGISTRATION_OPEN            = var.registration_open ? "true" : "false"
    REGISTRATION_ALLOWED_DOMAINS = join(",", var.registration_allowed_domains)
    # This app as an OAuth2 client of its own issuer, so the tenancy pages reach
    # the platform API as the signed-in person. Public hosts, as above.
    APP_URL          = "https://${local.id_host}"
    HYDRA_PUBLIC_URL = "https://${local.oauth_host}"
  }, var.id_client_id == "" ? {} : { OIDC_CLIENT_ID = var.id_client_id })

  # The client secret rides only with its id: a mounted secret with no enabled
  # version stops the service from starting, and an unregistered environment
  # has no version to give it.
  secret_env_vars = merge({
    IDENTITY_WEBHOOK_SECRET = "identity-webhook-secret"
    # Kratos posts its flow hook here; unset, the route answers 404 and no
    # sign-in is recorded, which is the safe half of the failure.
    AUDIT_WEBHOOK_SECRET = "audit-webhook-secret"
    # The other end of Hydra's refresh hook. Unset, that route answers 404 and
    # Hydra fails the refresh rather than reissuing unchecked claims.
    REFRESH_HOOK_SECRET = "refresh-hook-secret"
    # This repository's own database on the shared instance. Every slice in it
    # reads this one; a slice moving out sets its own override instead.
    DATABASE_URL = module.database.dsn_secret_ids["identity"]
  }, var.id_client_id == "" ? {} : { OIDC_CLIENT_SECRET = "id-client-secret" })

  depends_on = [
    google_project_service.apis,
    # Mounts read `latest`, so the grant must exist before the revision starts
    # and a reference to the secret id does not tell terraform that. Without
    # these, a first apply fails with "Permission denied on secret ...".
    google_secret_manager_secret_iam_member.identity_webhook,
    google_secret_manager_secret_iam_member.audit_hook,
    google_secret_manager_secret_iam_member.identity_dsn,
    google_secret_manager_secret_iam_member.oidc_client_secret,
  ]
}

module "console" {
  source = "../../modules/cloud-run"

  project = var.project
  region  = var.region
  name    = "console-${local.env}"
  port    = 3000
  # Anonymous invoker, because the LB forwards without a caller identity. The
  # bypass is closed by ingress instead: internal-and-cloud-load-balancing makes
  # the *.run.app URL unreachable, so proxy.ts is the only gate in the path.
  ingress               = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  allow_public          = true
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["console"].email
  min_instances         = 1

  env_vars = merge({
    NODE_ENV = "production"
    # The only service holding Kratos admin, reached with an identity token
    # minted for it, so the reach belongs to the container and not to whoever
    # opened a page. Public URLs go through the LB, as on apps/id.
    KRATOS_ADMIN_URL  = module.kratos_admin.uri
    HYDRA_ADMIN_URL   = module.hydra_admin.uri
    KRATOS_PUBLIC_URL = "https://${local.auth_host}"
    HYDRA_PUBLIC_URL  = "https://${local.oauth_host}"
    ID_APP_URL        = "https://${local.id_host}"
    CONSOLE_URL       = "https://${local.console_host}"
    # Who administers everything and may appoint admins. Configuration rather
    # than a stored role, so it survives anything done to an identity, and a
    # removal takes effect on the next request rather than when a grant expires.
    ROOT_EMAILS = var.root_emails
    # The same downstream the sign-in app tells, for the same reason: an
    # admin deleting somebody has to reach the profile row first.
    PLATFORM_API_URL = var.platform_api_url
    # This console as an OAuth2 client of its own issuer: the operator's own
    # token for /admin/*, and client_credentials for the organization reads.
  }, var.id_console_client_id == "" ? {} : { OIDC_CLIENT_ID = var.id_console_client_id })

  # As on the sign-in app: the secret rides only with its id.
  secret_env_vars = merge({
    IDENTITY_WEBHOOK_SECRET = "identity-webhook-secret"
    # The edge guard cannot open a Postgres connection, so it posts a refused
    # console access to this app's own intake route under this secret.
    AUDIT_WEBHOOK_SECRET = "audit-webhook-secret"
    DATABASE_URL         = module.database.dsn_secret_ids["identity"]
  }, var.id_console_client_id == "" ? {} : { OIDC_CLIENT_SECRET = "id-console-client-secret" })

  depends_on = [
    google_project_service.apis,
    # Mounts read `latest`, so the grant must exist before the revision starts
    # and a reference to the secret id does not tell terraform that. Without
    # these, a first apply fails with "Permission denied on secret ...".
    google_secret_manager_secret_iam_member.identity_webhook,
    google_secret_manager_secret_iam_member.audit_hook,
    google_secret_manager_secret_iam_member.identity_dsn,
    google_secret_manager_secret_iam_member.oidc_client_secret,
  ]
}

# The mail dispatcher, alone: the in-process courier is documented as
# single-instance, and a request-serving Kratos has to scale. Serves HTTP only
# because Cloud Run requires it; its work is the --watch-courier loop.
module "kratos_courier" {
  source = "../../modules/cloud-run"

  project               = var.project
  region                = var.region
  name                  = "kratos-courier-${local.env}"
  port                  = 4433
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name
  service_account_email = google_service_account.runtime["kratos"].email
  cloud_sql_instance    = module.database.connection_name
  ingress               = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  # Nothing calls this service at all, so it takes no invoker of any kind.
  allow_public  = false
  min_instances = 1
  max_instances = 1

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
    "--watch-courier",
  ]

  env_vars = {
    LOG_LEVEL                 = "info"
    SERVE_PUBLIC_BASE_URL     = "https://${local.auth_host}"
    COOKIES_DOMAIN            = local.base
    SESSION_COOKIE_DOMAIN     = local.base
    COURIER_SMTP_FROM_ADDRESS = var.mail_from_address
    COURIER_SMTP_FROM_NAME    = "buildOS"
  }

  secret_env_vars = {
    DSN                         = module.database.dsn_secret_ids["kratos"]
    SECRETS_COOKIE              = "kratos-secrets-cookie"
    SECRETS_CIPHER              = "kratos-secrets-cipher"
    COURIER_SMTP_CONNECTION_URI = "courier-smtp-connection-uri"
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.oidc_providers_placeholder,
    google_secret_manager_secret_iam_member.oidc_providers,
  ]
}
