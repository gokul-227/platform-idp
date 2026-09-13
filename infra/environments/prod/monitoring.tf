# Alerting for the failures /health/ready answers ok through: a courier that is
# not dispatching, a console that cannot reach Kratos, a missing signing key.
# Channels are injected, since a channel must be verified out of band; an empty
# list still opens incidents in Cloud Monitoring. See docs/operations.md.

variable "alert_notification_channels" {
  type        = list(string)
  description = "Notification channels every policy below notifies, as 'projects/<project>/notificationChannels/<id>'. Empty by default so this applies without an address existing yet; an alert with no channel opens an incident nobody is told about."
  default     = []
}

# ── Uptime checks ────────────────────────────────────────────────────────────
# One per public host, a different path on each, because no single path is a
# health signal on all five. The checker follows redirects and keeps cookies, so
# the id check covers the whole sign-in entry path (two redirects to a 200) and
# matches on a flow field, which is what makes it that rather than any 200.
locals {
  uptime_checks = {
    id = {
      host = local.id_host
      path = "/login"
      # A Kratos flow field: present only if the flow was created and rendered.
      body_contains  = "name=\"csrf_token\""
      display_suffix = "sign-in app"
    }
    auth = {
      host           = local.auth_host
      path           = "/health/ready"
      body_contains  = "\"status\":\"ok\""
      display_suffix = "Kratos public"
    }
    oauth = {
      host           = local.oauth_host
      path           = "/health/ready"
      body_contains  = "\"status\":\"ok\""
      display_suffix = "Hydra public"
    }
    console = {
      host           = local.console_host
      path           = "/denied"
      body_contains  = null
      display_suffix = "operator console"
    }
  }
}

resource "google_monitoring_uptime_check_config" "host" {
  for_each = local.uptime_checks

  project      = var.project
  display_name = "${local.env} ${each.value.host} (${each.value.display_suffix})"
  timeout      = "10s"
  period       = "300s"

  # Three regions is the documented minimum. Pinned rather than left to "all
  # regions" so the execution count per check is fixed.
  selected_regions = ["EUROPE", "USA", "ASIA_PACIFIC"]

  http_check {
    path         = each.value.path
    port         = 443
    use_ssl      = true
    validate_ssl = true

    # Every path above ends at a 200 once redirects are followed. Stated rather
    # than left to the 2xx default so a surface that starts answering 204 or 206
    # is a failure and not a shrug.
    accepted_response_status_codes {
      status_value = 200
    }
  }

  dynamic "content_matchers" {
    for_each = each.value.body_contains == null ? [] : [each.value.body_contains]
    content {
      content = content_matchers.value
      matcher = "CONTAINS_STRING"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project
      host       = each.value.host
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each = local.uptime_checks

  project               = var.project
  display_name          = "${local.env}: ${each.value.host} unreachable"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "uptime check failing for ${each.value.host}"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.host[each.key].uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"

      # Counts failed probes in a 20 minute window across the three regions, so
      # one region losing a single probe is not an incident and two are.
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = "${each.value.host}${each.value.path} stopped answering as expected. Checks the ${each.value.display_suffix}. See docs/operations.md."
    mime_type = "text/markdown"
  }
}

# ── Log-based policies ───────────────────────────────────────────────────────
# Kratos and Hydra log plain text to stderr, which Cloud Run gives no severity,
# and Kratos logs courier failures at level=warning. So every filter below
# matches textPayload rather than severity.

# The gate's own words: the operator sees only "cannot verify your session",
# which a wrong KRATOS_PUBLIC_URL, dead DNS, an expired certificate and a dead
# Kratos all produce. Matched on the invariant substring, not the log prefix.
resource "google_monitoring_alert_policy" "console_gate_session_unavailable" {
  project               = var.project
  display_name          = "${local.env}: console gate cannot reach Kratos"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "whoami unreachable from the console gate"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="console-${local.env}"
        textPayload:"whoami unreachable"
      EOT

      label_extractors = {
        revision = "EXTRACT(resource.labels.revision_name)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "The console gate failed closed: it could not reach Kratos at KRATOS_PUBLIC_URL and sent the operator to /denied?reason=session-unavailable. The log line carries the URL and the fetch error. Check the auth.${local.base} uptime check first."
    mime_type = "text/markdown"
  }
}

# Both lines Kratos emits: the per-attempt refusal, and "Message was abandoned",
# where a user told a code was sent will never get one. Scoped by prefix, not to
# one service name, which moves. No label reads message_subject: for code flows
# that subject is the plaintext code, and labels reach the notification.
resource "google_monitoring_alert_policy" "courier_dispatch_failed" {
  project               = var.project
  display_name          = "${local.env}: Kratos courier cannot send mail"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "courier dispatch failed or was abandoned"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name=~"^kratos-"
        (textPayload:"Unable to dispatch message"
          OR textPayload:"Unable to dial SMTP connection"
          OR textPayload:"Unable to send email using SMTP connection"
          OR textPayload:"Message was abandoned because it did not deliver")
      EOT

      label_extractors = {
        service  = "EXTRACT(resource.labels.service_name)"
        revision = "EXTRACT(resource.labels.revision_name)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "Kratos rendered a message and the SMTP provider refused it, so the UI has already told someone a code was sent. Usual causes: COURIER_SMTP_FROM_ADDRESS is not on a verified sender domain (550), or the credential in courier-smtp-connection-uri has lapsed (535). Read the queue with the query in docs/operations.md."
    mime_type = "text/markdown"
  }
}

# A dead courier logs nothing: mail sits in courier_messages while every health
# endpoint answers ok, so the dispatcher's own existence is the only handle. Two
# conditions because Cloud Run reports "no instances" as an absent series or a
# zero; 30m covers instance_count's ingestion delay. Blind to a courier running
# without --watch-courier, which no policy can express (docs/operations.md).
resource "google_monitoring_alert_policy" "courier_not_running" {
  project               = var.project
  display_name          = "${local.env}: Kratos courier is not running"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "courier service reports no instances"

    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"kratos-courier-${local.env}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "1800s"

      # Summed across active/idle and across revisions, so this is the total
      # number of containers that could be dispatching mail.
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "courier service stopped reporting instances"

    condition_absent {
      filter   = "metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"kratos-courier-${local.env}\""
      duration = "1800s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = "kratos-courier-${local.env} has no container, so nothing is draining courier_messages and every sign-in code is being queued and never sent. Both health endpoints stay ok through this. Check min_instances on the service and whether its latest revision became ready."
    mime_type = "text/markdown"
  }
}

# Scoped to the revision wording, not the service's, so one failure is one
# incident. The class this catches looks like a broken image: a secret with no
# enabled version, a missing secretAccessor, a mount whose secret is absent.
resource "google_monitoring_alert_policy" "revision_not_ready" {
  project               = var.project
  display_name          = "${local.env}: Cloud Run revision failed to become ready"
  combiner              = "OR"
  severity              = "ERROR"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "revision Ready condition went False"

    condition_matched_log {
      filter = <<-EOT
        logName="projects/${var.project}/logs/cloudaudit.googleapis.com%2Fsystem_event"
        resource.type="cloud_run_revision"
        protoPayload.status.message:"Ready condition status changed to False for Revision"
      EOT

      label_extractors = {
        service = "EXTRACT(resource.labels.service_name)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "A revision never reached Ready, so the previous one is still serving and the deploy silently did not take effect. protoPayload.status.message names the reason; SecretsAccessCheckFailed means either a secret version that does not exist or a runtime service account without roles/secretmanager.secretAccessor."
    mime_type = "text/markdown"
  }
}

# The two FATALs Postgres refuses with, out of postgres.log. One instance per
# project, so the resource type is filter enough. A num_backends threshold would
# need max_connections per tier to mean anything; the refusal does not.
resource "google_monitoring_alert_policy" "sql_connections_exhausted" {
  project               = var.project
  display_name          = "${local.env}: Cloud SQL out of connections"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "Postgres refused a connection"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloudsql_database"
        logName="projects/${var.project}/logs/cloudsql.googleapis.com%2Fpostgres.log"
        (textPayload:"too many clients already"
          OR textPayload:"remaining connection slots are reserved")
      EOT

      label_extractors = {
        database = "EXTRACT(resource.labels.database_id)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "Postgres is at max_connections. Every Ory service and the migration job share one instance, so this presents as unrelated services failing at once. db_tier sets max_connections; a runaway revision count is the other cause."
    mime_type = "text/markdown"
  }
}

# A self-grant leaves no trace anywhere a person looks. All three casings the
# method name takes across services, plus service-account key creation, which is
# how a grant becomes a durable credential.
resource "google_monitoring_alert_policy" "iam_policy_changed" {
  project               = var.project
  display_name          = "${local.env}: IAM policy changed"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = var.alert_notification_channels

  conditions {
    display_name = "SetIamPolicy or service account key creation"

    condition_matched_log {
      filter = <<-EOT
        logName="projects/${var.project}/logs/cloudaudit.googleapis.com%2Factivity"
        (protoPayload.methodName:"SetIamPolicy"
          OR protoPayload.methodName:"SetIAMPolicy"
          OR protoPayload.methodName:"setIamPolicy"
          OR protoPayload.methodName:"CreateServiceAccountKey")
      EOT

      label_extractors = {
        method = "EXTRACT(protoPayload.methodName)"
        actor  = "EXTRACT(protoPayload.authenticationInfo.principalEmail)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "Someone changed who can do what in this project. This fires on every terraform apply that touches IAM, which is the point: the noise is the baseline, and a change outside a deploy window is the signal. run.invoker on kratos-admin-${local.env} is the most privileged grant here (docs/operations.md)."
    mime_type = "text/markdown"
  }
}
