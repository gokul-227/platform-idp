variable "project" { type = string }

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" { type = string }
variable "image" { type = string }

variable "args" {
  type        = list(string)
  description = "Overrides the image CMD; the entrypoint stays, so this is the subcommand."
}

variable "service_account_email" { type = string }

variable "secret_env_vars" {
  type    = map(string)
  default = {}
}

variable "vpc_network" { type = string }
variable "vpc_subnet" { type = string }

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "require_attestation" {
  type        = bool
  description = <<-EOT
    Evaluate this resource against the project's Binary Authorization policy.
    Off by default: turning it on before the deploy workflow has attested every
    image blocks new revisions, and a rollback is also a new revision.
  EOT
  default     = false
}
