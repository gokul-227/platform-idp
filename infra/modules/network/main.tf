# Private-only data path. Cloud SQL gets no public address at all; Cloud Run
# reaches it through this VPC over direct egress, so the database is not
# routable from the internet even with no authorized networks.
resource "google_compute_network" "vpc" {
  project                 = var.project
  name                    = var.name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "run" {
  project                  = var.project
  region                   = var.region
  name                     = "${var.name}-run"
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
}

# Private services access: the range Google peers into for managed services.
resource "google_compute_global_address" "private_services" {
  project       = var.project
  name          = "${var.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# Cloud Run still needs the internet for SMTP and the upstream OIDC providers.
# Egress is PRIVATE_RANGES_ONLY on the services, so public traffic does not
# traverse the VPC and no NAT is required.
