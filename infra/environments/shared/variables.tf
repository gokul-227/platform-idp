variable "project" {
  type    = string
  default = "platform-id-shared"
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "domain" {
  type        = string
  description = "Zone this repo would be authoritative for."
  default     = "id.os.build"
}

variable "manage_dns" {
  type        = bool
  description = <<-EOT
    Off: os.build lives on Cloudflare, so the records for id.os.build are
    created there and this stack builds nothing. Each environment outputs the
    exact records to enter; see infra/README.md.

    On: this project is authoritative for id.os.build, and one delegation
    covers every environment because they all sit beneath it. prod is the zone
    apex, dev and test are labels under it, so there is one zone and one NS
    handover rather than three.
  EOT
  default     = true
}

# No defaults: an empty value drops that environment's records from the zone, so
# a default of "" turns a forgotten variable into deleting every record for a
# live environment. Values live in the committed terraform.tfvars.
variable "lb_ip_dev" {
  type        = string
  description = "Load balancer IP from environments/dev, or empty if not applied yet."
}

variable "lb_ip_test" {
  type        = string
  description = "Load balancer IP from environments/test, or empty if not applied yet."
}

variable "lb_ip_prod" {
  type        = string
  description = "Load balancer IP from environments/prod, or empty if not applied yet."
}
