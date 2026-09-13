# Data Access logs, and a home for the trail outside the project being audited.
# Admin Activity is always on; Data Access is off by default everywhere except
# BigQuery, so nothing records a secret being read. Enabled for the two services
# holding credentials: Secret Manager and Cloud SQL.

variable "audit_log_bucket_project" {
  type        = string
  description = "Project that owns the audit log bucket. Null means this project, which is the lean default and also the weak one: a compromised project admin can delete the sink and the bucket. Point it at a project nobody here administers to make the trail survive them."
  default     = null
}

variable "audit_log_retention_days" {
  type        = number
  description = "Days an audit log object cannot be deleted, overwritten or archived. Nothing deletes objects after it elapses; the policy is a floor, not a schedule."
  default     = 400
}

variable "audit_log_retention_locked" {
  type        = bool
  description = "Lock the retention policy. Locking is irreversible: the policy can never be shortened or removed and the bucket cannot be deleted until every object is past retention. That irreversibility is the whole control, and it is also why this is off by default."
  default     = false
}

locals {
  audit_project = coalesce(var.audit_log_bucket_project, var.project)

  # Named after the audited project, not the storing one, so pointing several
  # environments at one audit project keeps one bucket each.
  audit_bucket = "${var.project}-audit"
}

# ── Data Access audit logs ───────────────────────────────────────────────────
# DATA_READ is the one that matters: the only record of AccessSecretVersion, so
# without it a container reading a DSN it should not hold leaves no trace. The
# volume scales with cold starts, not requests.
resource "google_project_iam_audit_config" "secret_manager" {
  project = var.project
  service = "secretmanager.googleapis.com"

  audit_log_config { log_type = "ADMIN_READ" }
  audit_log_config { log_type = "DATA_READ" }
  audit_log_config { log_type = "DATA_WRITE" }
}

# Under its audit service name, not the sqladmin API name apis.tf enables. API
# calls only: SQL statements are Postgres's own logging. DATA_READ is the volume
# and the first to drop if the bill matters; the other two are cheap.
resource "google_project_iam_audit_config" "cloud_sql" {
  project = var.project
  service = "cloudsql.googleapis.com"

  audit_log_config { log_type = "ADMIN_READ" }
  audit_log_config { log_type = "DATA_READ" }
  audit_log_config { log_type = "DATA_WRITE" }
}

# ── Where the trail is kept ──────────────────────────────────────────────────
# Retention is the bucket's, not Logging's: the _Default copy keeps 30 days and
# is deletable by anyone with logging admin in this project.
resource "google_storage_bucket" "audit" {
  project  = local.audit_project
  name     = local.audit_bucket
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Refuses to delete a non-empty bucket, which with a retention policy in place
  # it always is.
  force_destroy = false

  retention_policy {
    retention_period = var.audit_log_retention_days * 24 * 60 * 60
    is_locked        = var.audit_log_retention_locked
  }
}

# Every audit stream, including system_event: that is where a Cloud Run revision
# refusing to become ready is recorded, and it is as much a part of "what
# happened here" as an API call.
resource "google_logging_project_sink" "audit" {
  project     = var.project
  name        = "audit-logs-${local.env}"
  description = "Every Cloud Audit Log stream to a retention-policy bucket, so the trail outlives this project's log buckets."
  destination = "storage.googleapis.com/${google_storage_bucket.audit.name}"

  filter = <<-EOT
    logName="projects/${var.project}/logs/cloudaudit.googleapis.com%2Factivity"
    OR logName="projects/${var.project}/logs/cloudaudit.googleapis.com%2Fdata_access"
    OR logName="projects/${var.project}/logs/cloudaudit.googleapis.com%2Fsystem_event"
    OR logName="projects/${var.project}/logs/cloudaudit.googleapis.com%2Fpolicy"
  EOT

  # Required once the bucket can live in another project, and harmless when it
  # does not: the shared legacy writer has no cross-project reach.
  unique_writer_identity = true
}

resource "google_storage_bucket_iam_member" "audit_writer" {
  bucket = google_storage_bucket.audit.name
  role   = "roles/storage.objectCreator"
  member = google_logging_project_sink.audit.writer_identity
}
