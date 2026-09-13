variable "project" { type = string }

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" { type = string }

variable "image" {
  type        = string
  description = "Placeholder on first create; the deploy workflow pushes the real tag and lifecycle.ignore_changes keeps Terraform from reverting it."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "port" {
  type    = number
  default = 8080
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "secret_env_vars" {
  type        = map(string)
  description = "Env var name -> Secret Manager secret id. Always the latest version."
  default     = {}
}

variable "service_account_email" { type = string }

variable "cloud_sql_instance" {
  type        = string
  description = "Connection name to attach, or empty for none."
  default     = ""
}

variable "ingress" {
  type    = string
  default = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
}

variable "allow_public" {
  type        = bool
  description = <<-EOT
    Grant allUsers run.invoker. Required for a service behind an external load
    balancer, because the LB forwards as an anonymous caller and ingress keeps
    the *.run.app URL unreachable.

    Leave false for anything not on the LB: then only principals holding
    run.invoker can call it, which is a real authentication boundary rather
    than a network one.
  EOT
  default     = false
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 5
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "vpc_network" {
  type        = string
  description = "VPC name for direct egress, or empty for no VPC attachment."
  default     = ""
}

variable "vpc_subnet" {
  type    = string
  default = ""
}

variable "invokers" {
  type        = list(string)
  description = <<-EOT
    Principals granted run.invoker. Every request then needs a Google-signed
    identity token for this service and an anonymous one gets 403, which is a
    caller identity rather than a network position.

    Compose it with ingress rather than choosing between them: INTERNAL_ONLY
    plus an invoker list means a caller has to be both inside the VPC and
    named, which is what the Ory admin services take. The cost is that
    INTERNAL_ONLY also refuses `gcloud run services proxy`, since that connects
    from outside the VPC, so a service that an operator reaches by hand wants
    ingress = all instead.
  EOT
  default     = []
}

variable "args" {
  type        = list(string)
  description = "Overrides the image CMD wholesale, flags included. How every Kratos deployment but the courier drops --watch-courier from the baked command; the --config paths then have to be repeated here."
  default     = []
}

variable "secret_files" {
  description = <<-EOT
    Secrets mounted as files rather than env vars, keyed by volume name.
    Needed where a value has no config path to address: Ory maps every scalar
    setting to an env var, but a list (the OIDC providers array) does not have
    one, so it arrives as an additional --config file instead.
  EOT
  type = map(object({
    file      = string
    mount_dir = string
    secret    = string
  }))
  default = {}
}

variable "sidecars" {
  description = <<-EOT
    Extra containers in this service, reachable from the main container on
    127.0.0.1 and from nowhere else. For a component that is only ever asked
    questions by this service: it then needs no ingress setting and no invoker,
    because it has no network address of its own.

    Each instance runs its own copy, so a sidecar holding database connections
    multiplies them by max_instances.
  EOT
  type = map(object({
    args            = optional(list(string), [])
    env_vars        = optional(map(string), {})
    image           = string
    secret_env_vars = optional(map(string), {})
  }))
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
