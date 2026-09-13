# Customer-managed encryption for prod's database, so revoking the key is a kill
# switch rather than a request to Google. Prod only because Cloud SQL binds the
# key at creation: dev and test would have to be rebuilt, losing every identity
# and enrolled second factor.
resource "google_kms_key_ring" "sql" {
  project  = var.project
  name     = "sql-${local.env}"
  location = var.region

  depends_on = [google_project_service.apis]
}

resource "google_kms_crypto_key" "sql" {
  name     = "sql"
  key_ring = google_kms_key_ring.sql.id
  purpose  = "ENCRYPT_DECRYPT"

  # Ninety days. A rotated key re-encrypts new data; existing data stays readable
  # through the version that wrote it, so rotation is safe but not retroactive.
  rotation_period = "7776000s"

  lifecycle {
    # Destroying a key makes the data it protects unrecoverable, including
    # backups. This is the one resource in the estate where a mistaken destroy
    # cannot be undone by re-applying.
    prevent_destroy = true
  }
}

# Cloud SQL encrypts through its own service agent, not through the caller, so
# the grant is to that agent rather than to any identity of ours.
data "google_project" "current" {
  project_id = var.project
}

resource "google_kms_crypto_key_iam_member" "sql" {
  crypto_key_id = google_kms_crypto_key.sql.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com"
}
