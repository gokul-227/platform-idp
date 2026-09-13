resource "google_artifact_registry_repository" "id" {
  project       = var.project
  location      = var.region
  repository_id = "id"
  format        = "DOCKER"
  description   = "Images for the Ory services (config baked from ory/) and the two Next apps."

  depends_on = [google_project_service.apis]
}
