# Values from outside the control plane, added out of band with
# `gcloud secrets versions add <id> --data-file=-`. Cloud Run will not start a
# service whose secret has no enabled version, so populate before first apply.
locals {
  secret_ids = [
    "kratos-secrets-cookie",
    "kratos-secrets-cipher",
    "hydra-secrets-system",
    "hydra-pairwise-salt",
    "courier-smtp-connection-uri",
    # Shared with the platform API, which uses it to authenticate the identity
    # webhooks. Both ends mount the same value.
    "identity-webhook-secret",
    # Authenticates both audit intake routes. One value, because both grant the
    # same thing. Unset, each route answers 404 and records nothing rather than
    # accepting an unauthenticated write.
    "audit-webhook-secret",
    # Presented by Hydra on every refresh grant and checked by the sign-in app,
    # which re-derives the token's claims from the identity. Unset, that route
    # answers 404 and Hydra fails the refresh rather than reissuing claims
    # nobody re-checked.
    "refresh-hook-secret",
    # Each Next app's own OAuth2 client secret on this estate's Hydra, one per
    # app because Hydra shows a secret once and a rotation must not take the
    # other app down with it.
    "id-client-secret",
    "id-console-client-secret",
  ]
}

resource "google_secret_manager_secret" "external" {
  for_each = toset(local.secret_ids)

  project   = var.project
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "kratos" {
  for_each = toset([
    "kratos-secrets-cookie",
    "kratos-secrets-cipher",
    "courier-smtp-connection-uri",
  ])

  project   = var.project
  secret_id = google_secret_manager_secret.external[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime["kratos"].email}"
}

# The two surfaces that can delete an identity, and so must be able to tell the
# platform first: the console when an operator does it, apps/id when a person
# closes their own account.
resource "google_secret_manager_secret_iam_member" "identity_webhook" {
  for_each = toset(["console", "id"])

  project   = var.project
  secret_id = google_secret_manager_secret.external["identity-webhook-secret"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value].email}"
}

# Each audit intake secret is read by exactly the one service that answers on
# it. Kratos holds its copy in the providers overlay, not through IAM.
resource "google_secret_manager_secret_iam_member" "audit_hook" {
  for_each = toset(["id", "console"])

  project   = var.project
  secret_id = google_secret_manager_secret.external["audit-webhook-secret"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value].email}"
}

# Read by the two ends of the refresh hook: Hydra presents it, the sign-in app
# checks it. The same value, because it authenticates one hop.
resource "google_secret_manager_secret_iam_member" "refresh_hook" {
  for_each = toset(["id", "hydra"])

  project   = var.project
  secret_id = google_secret_manager_secret.external["refresh-hook-secret"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value].email}"
}

# One app, one client: the sign-in app never learns the console's credential
# and the console never learns the sign-in app's.
resource "google_secret_manager_secret_iam_member" "oidc_client_secret" {
  for_each = {
    id      = "id-client-secret"
    console = "id-console-client-secret"
  }

  project   = var.project
  secret_id = google_secret_manager_secret.external[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_secret_manager_secret_iam_member" "hydra" {
  for_each = toset(["hydra-secrets-system", "hydra-pairwise-salt"])

  project   = var.project
  secret_id = google_secret_manager_secret.external[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime["hydra"].email}"
}

# A placeholder version so a service mounting this can start before anyone sets the
# real value, since one apply creates both. Not a working credential, which is the
# safe direction: the webhook is refused rather than orphaning a profile row.
resource "google_secret_manager_secret_version" "identity_webhook_placeholder" {
  secret      = google_secret_manager_secret.external["identity-webhook-secret"].id
  secret_data = "placeholder-set-the-real-value-out-of-band"

  deletion_policy = "DISABLE"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

# A file, not an env var: `providers` is a list with no config path to address, and
# a later config replaces the array wholesale, so it must list every provider.
# Terraform owns version 1; real credentials are added out of band as `latest`.
resource "google_secret_manager_secret" "oidc_providers" {
  project   = var.project
  secret_id = "kratos-oidc-providers"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "oidc_providers_placeholder" {
  secret      = google_secret_manager_secret.oidc_providers.id
  secret_data = file("${path.module}/../../../ory/kratos/oidc.providers.template.yml")

  # A destroyed version makes `latest` unreadable and the service stops booting.
  deletion_policy = "DISABLE"

  lifecycle {
    # Terraform seeds version 1 and stops. Without this, an edit to the
    # placeholder file pushes a newer version and silently reverts a working
    # environment to placeholders.
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "oidc_providers" {
  project   = var.project
  secret_id = google_secret_manager_secret.oidc_providers.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime["kratos"].email}"
}

# Per secret, not project-wide: the sync workflow writes these, and the
# per-service database DSNs generated here must stay unreadable to it. Accessor
# is what lets it skip a write when nothing changed.
resource "google_secret_manager_secret_iam_member" "deploy_version_adder" {
  for_each = toset(local.secret_ids)

  project   = var.project
  secret_id = each.value
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.deploy.email}"

  # `secret_id` is a plain string, so nothing tells terraform these containers
  # have to exist first. Without this the grant races the secret it names.
  depends_on = [google_secret_manager_secret.external]
}
# Not in `local.secret_ids`, so the grants above do not reach it. Adder only:
# this identity assembles the document and never reads back what it wrote.
resource "google_secret_manager_secret_iam_member" "deploy_oidc_providers_adder" {
  project   = var.project
  secret_id = google_secret_manager_secret.oidc_providers.secret_id
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.deploy.email}"
}

# The adder role carries no versions.list, so the deploy path's "populate only
# what is empty" check cannot answer without this. Viewer is the metadata half
# and stops short of the value, so this identity still cannot read what it writes.
resource "google_secret_manager_secret_iam_member" "deploy_version_viewer" {
  for_each = toset(local.secret_ids)

  project   = var.project
  secret_id = each.value
  role      = "roles/secretmanager.viewer"
  member    = "serviceAccount:${google_service_account.deploy.email}"

  depends_on = [google_secret_manager_secret.external]
}


