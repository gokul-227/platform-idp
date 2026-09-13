module "network" {
  source = "../../modules/network"

  project = var.project
  region  = var.region
  name    = "id-${local.env}"

  depends_on = [google_project_service.apis]
}
