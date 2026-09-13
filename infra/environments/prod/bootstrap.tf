# First staff identity. The console cannot create it, because reaching the
# console requires one, so it comes from a job inside the VPC instead.
# Run once per environment: gcloud run jobs execute bootstrap-staff-<env> --wait
module "bootstrap_staff" {
  source = "../../modules/cloud-run-job"

  project = var.project
  region  = var.region
  name    = "bootstrap-staff-${local.env}"
  image   = "${local.registry}/bootstrap:${local.env}"
  args    = []

  service_account_email = google_service_account.runtime["console"].email
  vpc_network           = module.network.network_name
  vpc_subnet            = module.network.subnet_name

  env_vars = {
    KRATOS_ADMIN_URL = module.kratos_admin.uri
    STAFF_EMAIL      = var.bootstrap_staff_email
    # superadmin, because granting console access is the one thing nobody else
    # can hand out yet. The job never rewrites an identity it finds.
    STAFF_ROLE                = "superadmin"
    STAFF_MIGRATE_IDENTITY_ID = var.bootstrap_migrate_identity_id
    STAFF_FIRST               = "Marius"
    STAFF_LAST                = "Bauer"
  }

  depends_on = [google_project_service.apis]
}
