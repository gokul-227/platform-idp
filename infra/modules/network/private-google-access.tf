# Without this a `*.run.app` address resolves publicly, so with
# PRIVATE_RANGES_ONLY egress the request bypasses the VPC and an internal-only
# callee refuses it as external traffic. Fixes the resolver rather than
# loosening the callee's ingress. The restricted VIP, not the private one: it
# serves only APIs supporting VPC Service Controls.
locals {
  restricted_vip_range = "199.36.153.4/30"
  restricted_vip_addresses = [
    "199.36.153.4",
    "199.36.153.5",
    "199.36.153.6",
    "199.36.153.7",
  ]

  private_zones = {
    googleapis = "googleapis.com."
    pkg-dev    = "pkg.dev."
    run-app    = "run.app."
  }
}

resource "google_dns_managed_zone" "private" {
  for_each = var.private_google_access ? local.private_zones : {}

  project     = var.project
  name        = "${var.name}-${each.key}"
  dns_name    = each.value
  description = "Resolves ${each.value} to the restricted VIP inside ${var.name}."
  visibility  = "private"

  private_visibility_config {
    networks {
      network_url = google_compute_network.vpc.id
    }
  }
}

resource "google_dns_record_set" "private_apex" {
  for_each = var.private_google_access ? local.private_zones : {}

  project      = var.project
  managed_zone = google_dns_managed_zone.private[each.key].name
  name         = each.value
  type         = "A"
  ttl          = 300
  rrdatas      = local.restricted_vip_addresses
}

resource "google_dns_record_set" "private_wildcard" {
  for_each = var.private_google_access ? local.private_zones : {}

  project      = var.project
  managed_zone = google_dns_managed_zone.private[each.key].name
  name         = "*.${each.value}"
  type         = "CNAME"
  ttl          = 300
  rrdatas      = [each.value]
}

# The VIP sits outside RFC1918, so PRIVATE_RANGES_ONLY egress would not route it
# through the VPC without a route that claims the range.
resource "google_compute_route" "restricted_vip" {
  count = var.private_google_access ? 1 : 0

  project          = var.project
  name             = "${var.name}-restricted-vip"
  network          = google_compute_network.vpc.name
  dest_range       = local.restricted_vip_range
  next_hop_gateway = "default-internet-gateway"
  description      = "Private Google Access VIP; traffic stays on Google's network."
}
