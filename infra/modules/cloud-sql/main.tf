resource "google_sql_database_instance" "this" {
  project             = var.project
  region              = var.region
  name                = var.name
  database_version    = "POSTGRES_16"
  deletion_protection = var.deletion_protection
  # Empty means Google-managed. Cannot be changed later: Cloud SQL binds the key
  # at creation, so switching one on is an instance rebuild and a data migration.
  encryption_key_name = var.encryption_key_name == "" ? null : var.encryption_key_name

  settings {
    # Stated: the default for a new instance is no longer ENTERPRISE, and
    # ENTERPRISE_PLUS refuses the db-custom-* tiers used here with a message
    # about tiers that says nothing about editions.
    edition           = "ENTERPRISE"
    tier              = var.tier
    disk_size         = var.disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    availability_type = var.availability_type

    backup_configuration {
      enabled                        = var.backup_enabled
      point_in_time_recovery_enabled = var.backup_enabled
      start_time                     = "02:00"
      # Retention is explicit rather than inherited, because the default is
      # seven backups and seven days of logs everywhere, which is too little for
      # prod and more than dev needs to pay for.
      transaction_log_retention_days = var.transaction_log_retention_days

      backup_retention_settings {
        retained_backups = var.retained_backups
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      # No public address. The instance is reachable only from inside the VPC,
      # so it is not routable from the internet at all rather than routable
      # but unauthorized.
      ipv4_enabled                                  = false
      private_network                               = var.private_network
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    database_flags {
      name  = "max_connections"
      value = tostring(var.max_connections)
    }
    # `database_flags` is the authoritative list the provider sends, so a flag
    # set by hand is one unrelated apply away from removal. Static for Postgres,
    # so enabling it restarts the instance; nothing connects this way yet.
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
}

resource "random_password" "app" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  project  = var.project
  instance = google_sql_database_instance.this.name
  name     = var.user_name
  password = random_password.app.result
}

resource "google_sql_database" "databases" {
  for_each = toset(var.databases)

  project  = var.project
  instance = google_sql_database_instance.this.name
  name     = each.value
}

# One DSN secret per database, because each Ory service takes its own.
resource "google_secret_manager_secret" "dsn" {
  for_each = toset(var.databases)

  project   = var.project
  secret_id = "${each.value}-dsn"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "dsn" {
  for_each = toset(var.databases)

  secret = google_secret_manager_secret.dsn[each.value].id

  # Never destroy on replace. A destroyed version makes `latest` unreadable,
  # so every service mounting it fails to start, and there is nothing to roll
  # back to. Disabled versions keep both the audit trail and the rollback.
  deletion_policy = "DISABLE"

  lifecycle {
    # The new version must exist before the old one is disabled. Without this,
    # terraform disables first, `latest` resolves to a disabled version, and
    # every service that starts in that window fails to read its DSN.
    create_before_destroy = true
  }
  # Private IP, not the /cloudsql socket, which needs the Auth Proxy and a
  # public or PSC endpoint. Bounded pool, because Ory opens one per process and
  # a service scales: max_conns * max_instances summed over every service must
  # stay under max_connections, or Postgres starts refusing everyone and the
  # symptom is unrelated services failing at once.
  secret_data = format(
    "postgres://%s:%s@%s:5432/%s?sslmode=require&max_conns=%d&max_idle_conns=%d&max_conn_lifetime=%s",
    var.user_name,
    random_password.app.result,
    google_sql_database_instance.this.private_ip_address,
    each.value,
    var.max_conns_per_process,
    var.max_idle_conns_per_process,
    var.max_conn_lifetime,
  )
}
