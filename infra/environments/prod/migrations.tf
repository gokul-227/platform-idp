# One job per schema, each on the same image, DSN and VPC as the service it
# precedes, so it cannot run against a different schema than the code that reads
# it. Keto needs its config file for the namespace definitions.
locals {
  migrations = {
    kratos = { image = "kratos", args = ["migrate", "sql", "-e", "--yes"], db = "kratos" }
    hydra  = { image = "hydra", args = ["migrate", "sql", "-e", "--yes"], db = "hydra" }
    keto   = { image = "keto", args = ["migrate", "up", "-y", "--config", "/etc/config/keto/keto.yml"], db = "keto" }
    # The one schema this repo owns; its entrypoint is the migration, so no
    # arguments. Runs as the sign-in app's identity because this database has one
    # DSN and one role that `id` already holds, so a third identity would
    # separate nothing and terraform cannot create one here by design.
    audit = { image = "audit-migrate", args = [], db = "identity", dsn_var = "DATABASE_URL", runtime = "id" }
  }
}

module "migrate" {
  source   = "../../modules/cloud-run-job"
  for_each = local.migrations

  project = var.project
  region  = var.region
  name    = "migrate-${each.key}-${local.env}"
  image   = "${local.registry}/${each.value.image}:${local.env}"
  args    = each.value.args

  service_account_email = google_service_account.runtime[try(each.value.runtime, each.key)].email
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name

  # Ory reads its connection string from DSN; this repo's own migration reads
  # DATABASE_URL, the one every slice in `identity` shares. Stated per job
  # rather than assumed.
  secret_env_vars = {
    (try(each.value.dsn_var, "DSN")) = module.database.dsn_secret_ids[each.value.db]
  }

  depends_on = [google_project_service.apis]
}

output "migration_jobs" {
  description = "Run these before deploying a revision: gcloud run jobs execute <name> --region europe-west3 --wait"
  value       = [for job in module.migrate : job.name]
}
