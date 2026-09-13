resource "google_dns_managed_zone" "id" {
  count = var.manage_dns ? 1 : 0

  project     = var.project
  name        = "id-os-build"
  dns_name    = "${var.domain}."
  description = "Authoritative DNS for ${var.domain}, delegated from os.build at the registrar."
  visibility  = "public"

  depends_on = [google_project_service.dns]
}

# Only Google may issue for this zone; managed certs come from pki.goog.
resource "google_dns_record_set" "caa" {
  count = var.manage_dns ? 1 : 0

  project      = var.project
  name         = "${var.domain}."
  managed_zone = google_dns_managed_zone.id[0].name
  type         = "CAA"
  ttl          = 3600

  rrdatas = [
    "0 issue \"pki.goog\"",
    "0 issuewild \"pki.goog\"",
  ]
}

# Per-env A records. Each env's LB IP is fed in as a variable after that
# stack is applied, so this zone never depends on the env states.
locals {
  # prod is the bare zone apex; non-prod sits under its own label.
  env_ips = {
    "${var.domain}"      = var.lb_ip_prod
    "dev.${var.domain}"  = var.lb_ip_dev
    "test.${var.domain}" = var.lb_ip_test
  }

  # Every hostname the load balancers serve, per environment.
  hosts = flatten([
    for base, ip in local.env_ips : ip == "" ? [] : [
      # The console is public, gated by its own staff-session check.
      for label in ["", "auth.", "oauth.", "gw.", "console."] : {
        name = "${label}${base}"
        ip   = ip
      }
    ]
  ])
}

resource "google_dns_record_set" "hosts" {
  for_each = var.manage_dns ? { for host in local.hosts : host.name => host } : {}

  project      = var.project
  name         = "${each.value.name}."
  managed_zone = google_dns_managed_zone.id[0].name
  type         = "A"
  ttl          = 300
  rrdatas      = [each.value.ip]
}
