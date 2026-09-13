resource "google_compute_region_network_endpoint_group" "neg" {
  for_each = var.services

  project               = var.project
  region                = var.region
  name                  = "${var.name}-${each.key}-neg"
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.cloud_run_name
  }
}

resource "google_compute_backend_service" "backend" {
  for_each = var.services

  project               = var.project
  name                  = "${var.name}-${each.key}"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  # See armor.tf. Null when Cloud Armor is off, or when this host is exempt.
  security_policy = contains(var.armor.exempt_host_keys, each.key) ? null : local.armor_policy_id

  backend {
    group = google_compute_region_network_endpoint_group.neg[each.key].id
  }

  log_config {
    enable      = var.armor.request_logging
    sample_rate = var.armor.request_logging ? var.armor.log_sample_rate : null
  }
}


resource "google_compute_url_map" "https" {
  project         = var.project
  name            = var.name
  default_service = google_compute_backend_service.backend[var.default_service].id

  dynamic "host_rule" {
    for_each = var.services
    content {
      hosts        = host_rule.value.domains
      path_matcher = host_rule.key
    }
  }

  dynamic "path_matcher" {
    for_each = var.services
    content {
      name            = path_matcher.key
      default_service = google_compute_backend_service.backend[path_matcher.key].id
    }
  }
}

# Redirect 80 -> 443. Ory sets Secure cookies and issues tokens; there is no
# plaintext mode worth serving.
resource "google_compute_url_map" "http_redirect" {
  project = var.project
  name    = "${var.name}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

# One certificate per hostname, not one certificate with N SANs.
#
# A single multi-SAN cert is a shared fate: adding a host rewrites the SAN
# list, which rotates that one cert and drops HTTPS for every host on the
# proxy until it reprovisions. Split per host and adding a hostname creates a
# new, independent cert; the existing ones are untouched and keep serving.
#
# A proxy takes up to 15 certificates, and SNI picks the right one.
resource "google_compute_managed_ssl_certificate" "cert" {
  for_each = toset(var.cert_domains)

  project = var.project
  # The domain is in the name so a rename never silently replaces another
  # host's cert. Dots are not legal in resource names.
  name = "${var.name}-${replace(each.value, ".", "-")}"

  managed {
    domains = [each.value]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_global_address" "ip" {
  project = var.project
  name    = "${var.name}-ip"
}

# Google's default profile still negotiates TLS 1.0 and 1.1 and their cipher
# suites. This fronts an identity provider, so the floor is stated rather than
# inherited. MODERN keeps every browser Kratos's own flows support.
resource "google_compute_ssl_policy" "tls" {
  project         = var.project
  name            = "${var.name}-tls"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_compute_target_https_proxy" "https" {
  project          = var.project
  name             = "${var.name}-https"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [for cert in google_compute_managed_ssl_certificate.cert : cert.id]
  ssl_policy       = google_compute_ssl_policy.tls.id
}

resource "google_compute_target_http_proxy" "http" {
  project = var.project
  name    = "${var.name}-http"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project
  name                  = "${var.name}-https"
  target                = google_compute_target_https_proxy.https.id
  ip_address            = google_compute_global_address.ip.address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project
  name                  = "${var.name}-http"
  target                = google_compute_target_http_proxy.http.id
  ip_address            = google_compute_global_address.ip.address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
