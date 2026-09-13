# Public surfaces only: the admin ports authenticate nobody, so reach is their
# control. One certificate per hostname, so adding a host is additive and
# cannot disturb the certs already serving.
module "load_balancer" {
  source = "../../modules/load-balancer"

  project = var.project
  region  = var.region
  name    = "id-${local.env}"

  services = {
    id     = { cloud_run_name = module.id.name, domains = [local.id_host] }
    kratos = { cloud_run_name = module.kratos.name, domains = [local.auth_host] }
    hydra  = { cloud_run_name = module.hydra.name, domains = [local.oauth_host] }

    # Gated by the console's own proxy.ts, not IAM, since the load balancer
    # forwards anonymously. The bypass is closed by the service taking
    # load-balancer ingress only, so its run.app URL 404s.
    console = { cloud_run_name = module.console.name, domains = [local.console_host] }
  }

  cert_domains = [
    local.id_host,
    local.auth_host,
    local.oauth_host,
    local.console_host,
  ]

  default_service = "id"

  # Rate limits on the credential endpoints; knobs in armor.tf.
  armor = local.armor

  depends_on = [google_project_service.apis]
}
