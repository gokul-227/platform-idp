output "ip_address" { value = google_compute_global_address.ip.address }

output "certificates" {
  description = "One per hostname, so adding a host cannot disturb the others."
  value       = { for domain, cert in google_compute_managed_ssl_certificate.cert : domain => cert.name }
}
