# What an incident can move without touching modules/load-balancer/armor.tf,
# which holds the policy and the reasoning. An unset field falls through to the
# module default, so overriding one number does not reset the others.

variable "armor_enabled" {
  type        = bool
  description = "Attach the policy to every public backend. False deletes it and leaves the load balancer as it was before Cloud Armor."
  default     = true
}

variable "armor_preview_only" {
  type        = bool
  description = "Evaluate and log every denying rule without acting on it. The one-apply way to rule the policy out as the cause of a sign-in failure."
  default     = false
}

variable "armor_adaptive_protection" {
  type        = bool
  description = "Layer 7 DDoS detection. Reports and proposes rules; deploys nothing on its own."
  default     = true
}

variable "armor_block_scanners" {
  type        = bool
  description = "Deny known scanner tooling on the paths that carry no credential. See the sensitivity note in the module."
  default     = true
}

variable "armor_request_logging" {
  type        = bool
  description = "Load balancer request logs, which is where a Cloud Armor decision is readable. Off leaves the policy unobservable; sample below instead."
  default     = true
}

variable "armor_log_sample_rate" {
  type        = number
  description = "Fraction of requests logged, 0 to 1."
  default     = 1
}

variable "armor_exempt_host_keys" {
  type        = set(string)
  description = "Keys of the load balancer's services map that get no policy at all. Empty: the console is attached too, and nothing in the policy can match it."
  default     = []
}

variable "armor_rate_limits" {
  description = "Per-IP thresholds for the credential endpoints. Every field is optional and falls through to the module default."
  type = object({
    login = optional(object({
      count            = optional(number)
      interval_sec     = optional(number)
      ban_count        = optional(number)
      ban_interval_sec = optional(number)
      ban_duration_sec = optional(number)
    }))
    registration = optional(object({
      count            = optional(number)
      interval_sec     = optional(number)
      ban_count        = optional(number)
      ban_interval_sec = optional(number)
      ban_duration_sec = optional(number)
    }))
    recovery = optional(object({
      count            = optional(number)
      interval_sec     = optional(number)
      ban_count        = optional(number)
      ban_interval_sec = optional(number)
      ban_duration_sec = optional(number)
    }))
    oidc_callback = optional(object({
      count            = optional(number)
      interval_sec     = optional(number)
      ban_count        = optional(number)
      ban_interval_sec = optional(number)
      ban_duration_sec = optional(number)
    }))
    token = optional(object({
      count            = optional(number)
      interval_sec     = optional(number)
      ban_count        = optional(number)
      ban_interval_sec = optional(number)
      ban_duration_sec = optional(number)
    }))
  })
  default = {}
}

locals {
  armor = {
    enabled             = var.armor_enabled
    preview_only        = var.armor_preview_only
    adaptive_protection = var.armor_adaptive_protection
    block_scanners      = var.armor_block_scanners
    request_logging     = var.armor_request_logging
    log_sample_rate     = var.armor_log_sample_rate
    exempt_host_keys    = var.armor_exempt_host_keys
    rate_limits         = var.armor_rate_limits
  }
}
