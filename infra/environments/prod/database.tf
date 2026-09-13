module "database" {
  source = "../../modules/cloud-sql"

  project = var.project
  region  = var.region
  name    = "id-${local.env}"
  tier    = var.db_tier
  # Stated rather than inherited from the tier, because the pool budget is
  # arithmetic against it: 4 connections per process times the max_instances of
  # every service on this instance, plus headroom for a migration and a human.
  max_connections                = 400
  encryption_key_name            = google_kms_crypto_key.sql.id
  backup_enabled                 = true
  retained_backups               = 30
  transaction_log_retention_days = 7
  deletion_protection            = true
  availability_type              = "REGIONAL"

  private_network = module.network.network_id

  # The peering must exist before an instance can take a private address.
  depends_on = [module.network]
}
