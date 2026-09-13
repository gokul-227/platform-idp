# One runtime identity per service, so a compromised container reaches only its
# own DSN. The Ory admin surfaces authenticate nobody, so network reach is the
# whole control: nothing below is public but the two apps and three Ory ports.
locals {
  runtimes = ["kratos", "hydra", "keto", "id", "console"]
}

resource "google_service_account" "runtime" {
  for_each = toset(local.runtimes)

  project      = var.project
  account_id   = "run-${each.value}-${local.env}"
  display_name = "Cloud Run runtime: ${each.value} (${local.env})"
}

# Only the services mounting the Cloud SQL socket; the rest reach the instance
# over the VPC's private address, which their DSN names. Also a project IAM
# binding, which terraform@ cannot write, so adding one means a workstation apply.
resource "google_project_iam_member" "sql_client" {
  for_each = toset(["kratos", "hydra", "keto"])

  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime[each.value].email}"
}

# Each Ory service reads only its own DSN secret.
resource "google_secret_manager_secret_iam_member" "dsn" {
  for_each = toset(["kratos", "hydra", "keto"])

  project   = var.project
  secret_id = module.database.dsn_secret_ids[each.value]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value].email}"
}

# This repository's own database, read by both apps and migrated by a job
# running as `id`. Still per-secret: neither can read Kratos's, and Kratos
# cannot read this.
resource "google_secret_manager_secret_iam_member" "identity_dsn" {
  for_each = toset(["id", "console"])

  project   = var.project
  secret_id = module.database.dsn_secret_ids["identity"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value].email}"
}
