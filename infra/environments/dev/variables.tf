variable "project" {
  type    = string
  default = "platform-id-dev-502710"
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "domain" {
  type    = string
  default = "id.os.build"
}

variable "github_org" {
  type    = string
  default = "aec-craft"
}

variable "github_repo" {
  type    = string
  default = "platform-id"
}

variable "db_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "platform_api_url" {
  type        = string
  description = "The resource server holding a profile row per identity, told before an identity is deleted. Empty means no such consumer and the call is skipped, which is a real deployment: an identity provider with nothing downstream. A URL that is set but unreachable refuses the deletion rather than orphaning the row."
  default     = "https://api.dev.platform.os.build"
}

variable "id_client_id" {
  type        = string
  description = "apps/id's own OAuth2 client on this estate's Hydra, audienced at platform_api_url, so the tenancy pages call the platform API as the signed-in person. Supplied per environment as the ID_CLIENT_ID GitHub variable. Empty means no client is registered: nothing is mounted and those pages say so instead of starting an authorization that cannot succeed."
  default     = ""
}

variable "id_console_client_id" {
  type        = string
  description = "The console's counterpart, with client_credentials as well for its service reads. Supplied as the ID_CONSOLE_CLIENT_ID GitHub variable; empty means not registered."
  default     = ""
}

variable "mail_from_address" {
  type        = string
  description = "Courier sender. Must be on a domain the provider has verified *and* that the API key in courier-smtp-connection-uri is authorised for; either gap is refused with a 550 at send time, after Kratos has already queued the message and told the user a code was sent."
  default     = "no-reply@mail.dev.id.os.build"
}

variable "root_emails" {
  type        = string
  description = "Comma-separated addresses that administer everything and may appoint admins. Supplied per environment as the ROOT_EMAILS GitHub variable, not committed, and read live by the apps so a removal takes effect on the next request."

  validation {
    condition     = length(trimspace(var.root_emails)) > 0
    error_message = "root_emails must name at least one address: a deployment with none has nobody able to appoint an admin, and no way back in."
  }
}

variable "bootstrap_staff_email" {
  type        = string
  description = "Email of the first operator. Gets a staff-schema identity with a staffRole; must still enrol TOTP itself, since the console requires aal2."
  default     = "marius@neobim.ai"
}

# Set it when the bootstrap job refuses because the address already exists on
# `default`; its error prints the id. By id and not a boolean, so the permission
# cannot outlive its purpose: a boolean left set would migrate whatever the next
# `bootstrap_staff_email` found, which could be a tenant account.
variable "bootstrap_migrate_identity_id" {
  type        = string
  description = "Identity id the bootstrap job may migrate to the staff schema. Empty migrates nothing."
  # dev's operator registered through self-service before the job first ran, so
  # this address sits on `default` with no role and the console works only
  # through the derived grant. This is that identity.
  default = "7daf4543-68dd-4e8b-b2e2-e7e0a0ea6d2a"
}


# Origins that redeem a code in the browser, so Hydra must answer them with CORS
# on /oauth2/token. Not derivable: they belong to other estates. A confidential
# client whose callback runs server side is not one.
variable "oauth_browser_origins" {
  type        = string
  description = "Comma-separated origins allowed to call Hydra's token endpoint from a browser."
  default     = "https://api.dev.platform.os.build"
}

# The resource server that asks Keto whether a caller may touch a row. It lives
# in another project, so no VPC placement reaches it and no module reference can
# name it. Empty means no such consumer and Keto keeps the console alone.
variable "platform_api_service_account" {
  type        = string
  description = "Service account of the platform API, granted run.invoker on Keto read."
  default     = "cloud-run-platform-api@platform-dev-495017.iam.gserviceaccount.com"
}

# Two settings, because "open to everyone" and "bounded to these domains" are
# different decisions. Opening an environment is then flipping one boolean,
# rather than reading a policy out of whether a list happens to be empty.
variable "registration_open" {
  type        = bool
  description = "Whether anyone may create an account through self-service registration. When true, registration_allowed_domains is ignored. False everywhere today; this is the switch prod flips when it opens."
  default     = false
}

variable "registration_allowed_domains" {
  type        = list(string)
  description = "Domains whose addresses may register themselves while registration_open is false. Empty admits nobody, which is a misconfiguration rather than a way to open registration. The console's admin creation is not bound by either setting; an operator may create an identity on any domain."
  default     = ["neobim.ai", "neobim.eu"]
}
