variable "project" { type = string }

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" { type = string }

variable "subnet_cidr" {
  type        = string
  description = "Subnet for Cloud Run direct VPC egress. Needs room for one address per concurrent instance."
  default     = "10.8.0.0/24"
}

variable "private_google_access" {
  type        = bool
  description = <<-EOT
    Resolve Google's hostnames to the restricted VIP inside this VPC, so
    service-to-service calls reach internal-only services without leaving
    Google's network. Off makes those calls fail rather than fall back to a
    public path, which is the safer default to be explicit about.
  EOT
  default     = true
}
