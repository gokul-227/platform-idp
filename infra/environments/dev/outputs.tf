output "load_balancer_ip" {
  value = module.load_balancer.ip_address
}

# Plain A records at the load balancer. On Cloudflare they must be DNS-only:
# a proxied record terminates TLS there, so the managed certificate never sees a
# validation request and sits in PROVISIONING for ever.
output "dns_records" {
  description = "Create these as DNS-only A records."
  value = [
    for host in [local.id_host, local.auth_host, local.oauth_host, local.console_host] :
    { type = "A", name = host, value = module.load_balancer.ip_address, proxied = false }
  ]
}

output "hosts" {
  value = {
    console = local.console_host
    id      = local.id_host
    kratos  = local.auth_host
    hydra   = local.oauth_host
  }
}

output "certificates" { value = module.load_balancer.certificates }
output "registry" { value = local.registry }
output "sql_connection_name" { value = module.database.connection_name }
