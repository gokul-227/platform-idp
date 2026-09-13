# One sending domain per environment, so a dev bounce cannot damage the
# reputation prod sends on. SPF and MX go under send.<key> because that is where
# the provider's own MAIL FROM lives. Values come from Resend's domain page.
variable "mail_domains" {
  description = <<-EOT
    Resend sending domains, keyed by hostname (e.g. mail.dev.id.os.build).
    dkim_value is the p=... TXT content, mx_target the region's
    feedback-smtp host, spf the TXT content for the send. subdomain, and dmarc
    an optional policy published at _dmarc.<hostname>.
  EOT
  type = map(object({
    dkim_value = string
    dmarc      = optional(string)
    # Region-specific, from Resend's own record list. Optional because DKIM and
    # SPF can be published first; the domain will not verify without it.
    mx_target = optional(string)
    spf       = optional(string, "v=spf1 include:amazonses.com ~all")
  }))
  default = {}
}

locals {
  # Cloud DNS rejects a TXT string over 255 characters, and a DKIM public key is
  # longer than that. It has to arrive as several quoted strings in one record,
  # which the resolver concatenates.
  dkim_chunks = {
    for host, config in var.mail_domains :
    host => join(" ", [
      for chunk in regexall(".{1,255}", config.dkim_value) : "\"${chunk}\""
    ])
  }
}

resource "google_dns_record_set" "dkim" {
  for_each = var.manage_dns ? var.mail_domains : {}

  project      = var.project
  name         = "resend._domainkey.${each.key}."
  managed_zone = google_dns_managed_zone.id[0].name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = [local.dkim_chunks[each.key]]
}

resource "google_dns_record_set" "mail_spf" {
  for_each = var.manage_dns ? var.mail_domains : {}

  project      = var.project
  name         = "send.${each.key}."
  managed_zone = google_dns_managed_zone.id[0].name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"${each.value.spf}\""]
}

# The bounce and complaint path. Without it Resend cannot process feedback, and
# receivers see a sender that ignores bounces.
resource "google_dns_record_set" "mail_mx" {
  for_each = var.manage_dns ? {
    for host, config in var.mail_domains : host => config
    if config.mx_target != null
  } : {}

  project      = var.project
  name         = "send.${each.key}."
  managed_zone = google_dns_managed_zone.id[0].name
  type         = "MX"
  ttl          = 3600
  rrdatas      = ["10 ${each.value.mx_target}."]
}

# Optional, and worth starting at p=none: it reports without rejecting, so a
# missing record somewhere does not silently drop sign-in codes.
resource "google_dns_record_set" "dmarc" {
  for_each = var.manage_dns ? {
    for host, config in var.mail_domains : host => config
    if config.dmarc != null
  } : {}

  project      = var.project
  name         = "_dmarc.${each.key}."
  managed_zone = google_dns_managed_zone.id[0].name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"${each.value.dmarc}\""]
}

output "mail_records" {
  description = "Published sending records, to compare against Resend's page."
  value = {
    for host in keys(var.mail_domains) : host => {
      dkim = "resend._domainkey.${host}"
      spf  = "send.${host}"
      mx   = "send.${host}"
    }
  }
}
