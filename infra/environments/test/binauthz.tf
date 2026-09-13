# A revision may only start an image the deploy workflow built and signed, so
# push access to Artifact Registry is no longer enough to run code here.
# Two independent switches: this policy's enforcement_mode, and
# `binary_authorization { use_default = true }` per service and job. Cloud Run
# consults the policy only for a resource that opted in; order is in docs/deploy.md.

# Declared here rather than in variables.tf: it is the one knob in this stack
# that can stop every deployment, and it reads better next to what it governs.
variable "binauthz_enforcement_mode" {
  type        = string
  description = "DRYRUN_AUDIT_LOG_ONLY records the verdict and admits the image anyway; ENFORCED_BLOCK_AND_AUDIT_LOG refuses the revision. Stay on dry-run until the audit log shows a pass for every image, then switch. A service that cannot start a revision keeps serving the old one but cannot be updated, including to roll back."
  default     = "DRYRUN_AUDIT_LOG_ONLY"

  validation {
    condition     = contains(["DRYRUN_AUDIT_LOG_ONLY", "ENFORCED_BLOCK_AND_AUDIT_LOG"], var.binauthz_enforcement_mode)
    error_message = "Must be DRYRUN_AUDIT_LOG_ONLY or ENFORCED_BLOCK_AND_AUDIT_LOG. ENFORCED_DRYRUN_AUDIT_LOG_ONLY is not a mode, and the other API values do not require an attestation."
  }
}

# ── Signing key ───────────────────────────────────────────────────────────────
# The private half never leaves KMS, so a compromised runner can ask for a
# signature but cannot take the key and sign elsewhere later.
resource "google_kms_key_ring" "binauthz" {
  project  = var.project
  name     = "binauthz"
  location = var.region

  depends_on = [google_project_service.apis]
}

# No rotation_period: the attestor pins one version's public key, so a new
# primary would sign attestations the policy cannot verify. Rotating means
# adding the new public key and moving the workflow's key version together.
resource "google_kms_crypto_key" "attestor" {
  name     = "attestor"
  key_ring = google_kms_key_ring.binauthz.id
  purpose  = "ASYMMETRIC_SIGN"

  version_template {
    algorithm = "EC_SIGN_P256_SHA256"
  }
}

data "google_kms_crypto_key_version" "attestor" {
  crypto_key = google_kms_crypto_key.attestor.id
  version    = 1
}

locals {
  binauthz_public_key_id = "//cloudkms.googleapis.com/v1/${data.google_kms_crypto_key_version.attestor.name}"
}

# ── Attestor ──────────────────────────────────────────────────────────────────
# The note is where the signatures land: one occurrence per attested digest.
resource "google_container_analysis_note" "attestor" {
  project = var.project
  name    = "deploy"

  attestation_authority {
    hint {
      human_readable_name = "Built and signed by ${var.github_org}/${var.github_repo}"
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_binary_authorization_attestor" "deploy" {
  project = var.project
  name    = "deploy"

  attestation_authority_note {
    note_reference = "projects/${var.project}/notes/${google_container_analysis_note.attestor.name}"

    public_keys {
      # Pinned on both sides: the signer writes this string and the policy looks
      # the key up by it. Disagreeing means the attestation is not found, whose
      # only symptom is a revision refused as unauthorized.
      id = local.binauthz_public_key_id

      pkix_public_key {
        public_key_pem = data.google_kms_crypto_key_version.attestor.public_key[0].pem
        # KMS spells this EC_SIGN_P256_SHA256; Binary Authorization normalises
        # to ECDSA_P256_SHA256, so echoing the KMS name back would diff forever.
        signature_algorithm = "ECDSA_P256_SHA256"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Policy ────────────────────────────────────────────────────────────────────
# One exemption, not optional: a service must exist before the workflow has
# anywhere to push to, so cloud-run defaults var.image to Google's placeholder
# and every service here was created on it. Without the pattern, standing up an
# environment fails at the first service create and reads as a broken image. It
# buys a static hello page, not code execution; every real image is attested.
resource "google_binary_authorization_policy" "policy" {
  project     = var.project
  description = "Only digests attested by the ${var.github_org}/${var.github_repo} deploy workflow may run."

  # Google-maintained system images stay admissible without being listed one by
  # one; the rule below governs our own registry.
  global_policy_evaluation_mode = "ENABLE"

  admission_whitelist_patterns {
    name_pattern = "us-docker.pkg.dev/cloudrun/container/*"
  }

  default_admission_rule {
    evaluation_mode  = "REQUIRE_ATTESTATION"
    enforcement_mode = var.binauthz_enforcement_mode
    # Spelled out, not taken from the resource id: an unknown here renders the
    # rule as an empty requirement in the plan, and this is the one line worth
    # reading before agreeing to it.
    require_attestations_by = ["projects/${var.project}/attestors/${google_binary_authorization_attestor.deploy.name}"]
  }

  depends_on = [google_project_service.apis]
}

# ── What the deploy identity may do ───────────────────────────────────────────
# Sign, and nothing else: roles/cloudkms.signerVerifier would also grant
# useToVerify, and verifying is the policy's job, not the signer's.
resource "google_kms_crypto_key_iam_member" "deploy_signer" {
  crypto_key_id = google_kms_crypto_key.attestor.id
  role          = "roles/cloudkms.signer"
  member        = "serviceAccount:${google_service_account.deploy.email}"
}

# gcloud reads the key's algorithm before it can sign with it.
resource "google_kms_crypto_key_iam_member" "deploy_public_key_viewer" {
  crypto_key_id = google_kms_crypto_key.attestor.id
  role          = "roles/cloudkms.publicKeyViewer"
  member        = "serviceAccount:${google_service_account.deploy.email}"
}

# On the note, so the workflow can attach an occurrence to this attestor and to
# no other.
resource "google_container_analysis_note_iam_member" "deploy_attacher" {
  project = var.project
  note    = google_container_analysis_note.attestor.name
  role    = "roles/containeranalysis.notes.attacher"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# Occurrences have no resource to scope a grant to before they exist, so this is
# project-wide by construction. The note grant above is what confines what the
# workflow can actually attest to.
resource "google_project_iam_member" "deploy_occurrences" {
  project = var.project
  role    = "roles/containeranalysis.occurrences.editor"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# The workflow signs with --validate, one call that turns a key id or algorithm
# mismatch into a red build rather than a revision refused days later.
resource "google_binary_authorization_attestor_iam_member" "deploy_verifier" {
  project  = var.project
  attestor = google_binary_authorization_attestor.deploy.name
  role     = "roles/binaryauthorization.attestorsVerifier"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

# What .github/workflows/deploy.yml hardcodes. Nothing reads this at deploy time;
# it is here so a rename on either side is caught by comparing the two.
output "binauthz_signing" {
  description = "Attestor, KMS key version and public key id the deploy workflow signs with, and whether the policy currently blocks."
  value = {
    attestor      = google_binary_authorization_attestor.deploy.name
    key_version   = data.google_kms_crypto_key_version.attestor.name
    public_key_id = local.binauthz_public_key_id
    enforcement   = var.binauthz_enforcement_mode
  }
}
