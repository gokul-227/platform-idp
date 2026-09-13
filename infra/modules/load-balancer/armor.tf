# The per-client brake Kratos's own per-flow limit cannot be: a run minting a fresh
# flow per attempt never meets that one.
#
# Two facts shape every rule. Service-to-service traffic arrives here on one egress
# address, so a per-IP rule matching it bans the environment, and every path those
# callers use is outside every rule below. Cloud Armor also reads urlencoded bodies
# as arguments, so the one WAF rule is scoped off /self-service/ entirely.

locals {
  armor_policy_id = one(google_compute_security_policy.armor[*].id)

  # Keys name the rule in the Cloud Armor logs, so they are part of the
  # interface; see docs/operations.md.
  armor_rate_rules = {
    # ~20 sign-ins a minute from one address, which covers an office behind one
    # NAT and trips a stuffing run within seconds. The ban escalates only for a
    # client that keeps pushing after being throttled.
    login = {
      priority    = 1100
      description = "Kratos login: per-IP rate limit on flow init and submission, excluding the server-side flow fetch"
      expression  = "request.path.startsWith('/self-service/login') && !request.path.startsWith('/self-service/login/flows')"
      limit       = var.armor.rate_limits.login
    }

    # Registration is once per person. A burst from one address is a signup run
    # or an attempt to send verification mail to addresses that did not ask for
    # it, so there is no legitimate repeat to protect and the ban runs longer.
    registration = {
      priority    = 1110
      description = "Kratos registration: per-IP rate limit, excluding the server-side flow fetch"
      expression  = "request.path.startsWith('/self-service/registration') && !request.path.startsWith('/self-service/registration/flows')"
      limit       = var.armor.rate_limits.registration
    }

    # Every accepted recovery request sends mail. Abuse here costs courier quota
    # and reads to the victim as a phishing wave, so this is the tightest rule.
    # A person asks once, twice if the first mail is slow.
    recovery = {
      priority    = 1120
      description = "Kratos recovery: per-IP rate limit, excluding the server-side flow fetch"
      expression  = "request.path.startsWith('/self-service/recovery') && !request.path.startsWith('/self-service/recovery/flows')"
      limit       = var.armor.rate_limits.recovery
    }

    # Sends mail per accepted request like recovery, so it carries recovery's
    # allowance: uncovered, it is a way to aim the courier quota at an address
    # list without meeting that rule.
    verification = {
      priority    = 1140
      description = "Kratos verification: per-IP rate limit, excluding the server-side flow fetch"
      expression  = "request.path.startsWith('/self-service/verification') && !request.path.startsWith('/self-service/verification/flows')"
      limit       = var.armor.rate_limits.verification
    }

    # Callers here are already authenticated, so the allowance is loose enough
    # for a retyped TOTP code. What it brakes is a stolen password grinding at
    # the second factor: six digits at this rate takes weeks, not hours.
    settings = {
      priority    = 1150
      description = "Kratos settings: per-IP rate limit on credential changes and second-factor enrolment, excluding the server-side flow fetch"
      expression  = "request.path.startsWith('/self-service/settings') && !request.path.startsWith('/self-service/settings/flows')"
      limit       = var.armor.rate_limits.settings
    }

    # The IdP redirects the browser here, so the address is the user's. The
    # match is method-agnostic because Entra can answer with form_post.
    oidc_callback = {
      priority    = 1130
      description = "Kratos OIDC callback: per-IP rate limit on the upstream return leg"
      expression  = "request.path.startsWith('/self-service/methods/') && request.path.contains('/callback')"
      limit       = var.armor.rate_limits.oidc_callback
    }

    # Legitimate callers are servers, so this covers a whole client's traffic
    # from one egress address: a brake on a runaway, not on a patient guesser.
    # Per-client is inexpressible, since Cloud Armor keys on IP and the client
    # id is in the body.
    token = {
      priority    = 1200
      description = "Hydra token endpoint: per-IP rate limit"
      expression  = "request.path == '/oauth2/token'"
      limit       = var.armor.rate_limits.token
    }
  }
}

resource "google_compute_security_policy" "armor" {
  count = var.armor.enabled ? 1 : 0

  project     = var.project
  name        = "${var.name}-armor"
  description = "Per-IP limits on the credential endpoints, and Layer 7 DDoS detection. Default allow."

  # Detection only: no threshold_configs means nothing is auto-deployed, so
  # Adaptive Protection reports an attack and proposes a rule rather than
  # applying one. Needs a Cloud Armor Enterprise subscription to do anything.
  dynamic "adaptive_protection_config" {
    for_each = var.armor.adaptive_protection ? [1] : []
    content {
      layer_7_ddos_defense_config {
        enable          = true
        rule_visibility = "STANDARD"
      }
    }
  }

  # Sensitivity 1 and never higher: level 2 adds id913101, which matches generic
  # scripted HTTP clients, and every internal call here is one (a Node fetch).
  # The path guard is the point of the rule: argument inspection covers POST
  # bodies, so without it a password containing a scanner's name is a 403.
  dynamic "rule" {
    for_each = var.armor.block_scanners ? [1] : []
    content {
      action      = "deny(403)"
      priority    = 1000
      preview     = var.armor.preview_only
      description = "Known scanner tooling, off the credential paths"
      match {
        expr {
          expression = "!request.path.startsWith('/self-service/') && evaluatePreconfiguredWaf('scannerdetection-v33-stable', {'sensitivity': 1})"
        }
      }
    }
  }

  dynamic "rule" {
    for_each = local.armor_rate_rules
    content {
      action      = "rate_based_ban"
      priority    = rule.value.priority
      preview     = var.armor.preview_only
      description = rule.value.description

      match {
        expr {
          expression = rule.value.expression
        }
      }

      rate_limit_options {
        enforce_on_key   = "IP"
        conform_action   = "allow"
        exceed_action    = "deny(429)"
        ban_duration_sec = rule.value.limit.ban_duration_sec

        rate_limit_threshold {
          count        = rule.value.limit.count
          interval_sec = rule.value.limit.interval_sec
        }

        # Second, wider window: being throttled is not yet a ban, pushing on
        # through the throttle is.
        ban_threshold {
          count        = rule.value.limit.ban_count
          interval_sec = rule.value.limit.ban_interval_sec
        }
      }
    }
  }

  # Declared rather than left implicit. Google creates this rule with the
  # policy, and a policy that does not declare it reads back one rule it does
  # not own, which terraform then wants to delete on every plan.
  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default allow. Nothing above this line matches a path without a credential on it."

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}
