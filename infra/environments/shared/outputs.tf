output "zone_name" {
  value = var.manage_dns ? google_dns_managed_zone.id[0].name : null
}

output "name_servers" {
  description = "Delegate the `id` label of os.build to these, only if manage_dns is on."
  value       = var.manage_dns ? google_dns_managed_zone.id[0].name_servers : []
}
