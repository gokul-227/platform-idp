variable "project" { type = string }

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" { type = string }

variable "databases" {
  type        = list(string)
  description = "One database per owner: the three Ory services, plus `identity` for this repository's own tables. Slices inside `identity` share it and keep their own drizzle journal, the way platform's six do."
  default     = ["kratos", "hydra", "keto", "identity"]
}

variable "user_name" {
  type    = string
  default = "id_app_role"
}

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "disk_size" {
  type    = number
  default = 10
}

variable "availability_type" {
  type    = string
  default = "ZONAL"
}

variable "backup_enabled" {
  type    = bool
  default = true
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "private_network" {
  type        = string
  description = "VPC self-link. Required: the instance has no public IP, so this is its only path."
}

variable "retained_backups" {
  type        = number
  description = "How many automated backups to keep. 1 to 365."
  default     = 7
}

variable "transaction_log_retention_days" {
  description = <<-EOT
    Days of write-ahead logs kept for point-in-time recovery, which bounds how
    far back a restore can land. Cloud SQL Enterprise allows 1 to 7 for
    PostgreSQL; 7 is therefore the most prod can have without Enterprise Plus.
  EOT
  type        = number
  default     = 7
}

variable "max_conns_per_process" {
  type        = number
  description = <<-EOT
    Connections one Ory process may open. Multiply by the caller's
    max_instances, sum across every service sharing this instance, and keep the
    total under max_connections with headroom for migrations and a human.
  EOT
  default     = 4
}

variable "max_idle_conns_per_process" {
  type        = number
  description = "Idle connections kept open. Below max_conns so bursts release."
  default     = 2
}

variable "max_conn_lifetime" {
  type        = string
  description = "Recycle connections so a failover does not leave a process holding dead ones."
  default     = "30m"
}

variable "max_connections" {
  type        = number
  description = "Instance ceiling, set as a database flag so the budget above is explicit rather than inherited from the tier."
  default     = 100
}

variable "encryption_key_name" {
  type        = string
  description = <<-EOT
    Customer-managed key for the instance's data at rest. Settable only at
    creation: an existing instance cannot be moved onto a key, so an environment
    either starts with one or is rebuilt. Empty uses Google-managed keys.
  EOT
  default     = ""
}
