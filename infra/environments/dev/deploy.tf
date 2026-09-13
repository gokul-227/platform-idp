# Workload Identity Federation, not a key: the token is minted per run, so there
# is nothing to leak or rotate. It can push an image to one repository, run a
# migration job, and point a service at a new image. Nothing else.
#
# The second CI identity, `terraform@`, applies these stacks and is created out
# of band: an identity terraform manages is one terraform can widen, which is
# the escalation the split exists to prevent. See docs/deploy.md.
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "Federated identity for ${var.github_org}/${var.github_repo}."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Without it any repository on GitHub can mint tokens for this project. The
  # ref is here rather than on the bindings because a release tag cannot be a
  # principalSet member, and refusing at the exchange is the stronger place: a
  # pull request ref cannot mint a token for this pool at all.
  attribute_condition = "assertion.repository == \"${var.github_org}/${var.github_repo}\" && (assertion.ref == \"refs/heads/main\" || assertion.ref.startsWith(\"refs/tags/v\"))"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  project      = var.project
  account_id   = "deploy"
  display_name = "GitHub Actions deployer (${local.env})"
}

# Every principal the provider admits, which is main and a release tag and
# nothing else. A pull request ref, including one from a fork, is refused at the
# token exchange above and never reaches this binding.
resource "google_service_account_iam_member" "deploy_federated" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# Not roles/run.developer, which grants sshRoot: a shell in a running container
# reads every environment variable, the DSN and SMTP credential included. Also
# absent, deliberately: services.create/delete and any setIamPolicy.
resource "google_project_iam_custom_role" "deployer" {
  project     = var.project
  role_id     = "deployer"
  title       = "Cloud Run deployer"
  description = "Roll a revision and run a job. No shell, no IAM, no create or delete."

  permissions = [
    "resourcemanager.projects.get",
    "run.services.get",
    "run.services.list",
    "run.services.update",
    "run.revisions.get",
    "run.revisions.list",
    "run.operations.get",
    "run.jobs.get",
    "run.jobs.list",
    "run.jobs.run",
    "run.executions.get",
    "run.executions.list",
    "run.tasks.get",
    "run.tasks.list",
  ]
}

resource "google_project_iam_member" "deploy" {
  project = var.project
  role    = google_project_iam_custom_role.deployer.name
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# On the repository, not the project: a project-wide grant would also cover any
# repository added later, including one holding something unrelated.
resource "google_artifact_registry_repository_iam_member" "deploy" {
  project    = var.project
  location   = google_artifact_registry_repository.id.location
  repository = google_artifact_registry_repository.id.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}

# Updating a service that runs *as* another identity requires impersonating it,
# so this is per runtime account rather than project-wide.
resource "google_service_account_iam_member" "deploy_runtime" {
  for_each = google_service_account.runtime

  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

output "wif_provider" {
  description = "GitHub environment variable WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "wif_service_account" {
  description = "GitHub environment variable WIF_SERVICE_ACCOUNT."
  value       = google_service_account.deploy.email
}
