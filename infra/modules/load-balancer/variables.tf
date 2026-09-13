variable "project" { type = string }

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" { type = string }

variable "services" {
  type = map(object({
    cloud_run_name = string
    domains        = list(string)
  }))
}


variable "default_service" { type = string }

variable "cert_domains" {
  type        = list(string)
  description = "One managed certificate is created per entry. Adding one is additive and does not disturb the certs already serving."
  default     = []
}

variable "armor" {
  description = <<-EOT
    Cloud Armor. On by default; `enabled = false` detaches the policy from every
    backend and deletes it, which is the pre-Armor behaviour.

    Every threshold is an attribute with a default, so an incident is tuned with
    a variable rather than a code change. The reasoning behind each number is in
    armor.tf next to the rule it belongs to. Unset and null both fall through to
    the default here, so `{ rate_limits = { login = { count = 200 } } }` moves
    one number and leaves the rest alone.

    `preview_only` puts every denying rule into log-only mode without deleting
    it: the way to answer "is this policy what broke sign-in" in one apply.

    `exempt_host_keys` names keys of `services` that get no policy at all. It is
    empty by default, including for the console: the console is attached but
    nothing here can plausibly match it, since the rate-limited paths do not
    exist on that host and the scanner rule needs a scanner's own User-Agent.
    The knob is the escape hatch for a rule that misfires on a staff surface
    that is already gated to aal2, where locking staff out costs more than the
    abuse it would prevent.
  EOT

  type = object({
    enabled             = optional(bool, true)
    preview_only        = optional(bool, false)
    adaptive_protection = optional(bool, true)
    block_scanners      = optional(bool, true)
    exempt_host_keys    = optional(set(string), [])

    # A Cloud Armor decision is only visible in the load balancer's request log,
    # and that log is off by default on a backend service. Without it there is
    # no way to read what a rule matched, which makes `preview_only` useless and
    # an incident invisible. Sampling is the dial if the volume ever costs
    # something; turning it off leaves the policy unobservable.
    request_logging = optional(bool, true)
    log_sample_rate = optional(number, 1)

    # count/interval_sec is the sustained per-IP allowance; ban_count over
    # ban_interval_sec is what turns a throttle into a ban for ban_duration_sec.
    rate_limits = optional(object({
      login = optional(object({
        count            = optional(number, 60)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 300)
        ban_interval_sec = optional(number, 300)
        ban_duration_sec = optional(number, 600)
      }), {})

      registration = optional(object({
        count            = optional(number, 20)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 100)
        ban_interval_sec = optional(number, 300)
        ban_duration_sec = optional(number, 1800)
      }), {})

      recovery = optional(object({
        count            = optional(number, 10)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 40)
        ban_interval_sec = optional(number, 600)
        ban_duration_sec = optional(number, 1800)
      }), {})

      # Mail-sending, so recovery's numbers.
      verification = optional(object({
        count            = optional(number, 10)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 40)
        ban_interval_sec = optional(number, 600)
        ban_duration_sec = optional(number, 1800)
      }), {})

      # Authenticated callers, so loose enough to retype a TOTP code.
      settings = optional(object({
        count            = optional(number, 30)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 150)
        ban_interval_sec = optional(number, 300)
        ban_duration_sec = optional(number, 900)
      }), {})

      oidc_callback = optional(object({
        count            = optional(number, 30)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 150)
        ban_interval_sec = optional(number, 300)
        ban_duration_sec = optional(number, 600)
      }), {})

      token = optional(object({
        count            = optional(number, 300)
        interval_sec     = optional(number, 60)
        ban_count        = optional(number, 3000)
        ban_interval_sec = optional(number, 300)
        ban_duration_sec = optional(number, 300)
      }), {})
    }), {})
  })

  default = {}
}
