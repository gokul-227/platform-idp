resource "google_cloud_run_v2_service" "this" {
  project  = var.project
  location = var.region
  name     = var.name
  ingress  = var.ingress

  # Binary Authorization is per-resource opt-in on Cloud Run: the project policy
  # is inert until a service asks to be evaluated against it. Behind a variable
  # so an environment can run the policy in dry-run first and only then enforce.
  dynamic "binary_authorization" {
    for_each = var.require_attestation ? [1] : []
    content {
      use_default = true
    }
  }

  template {
    service_account = var.service_account_email

    # Direct VPC egress so the private-IP database is reachable.
    # PRIVATE_RANGES_ONLY keeps public traffic (SMTP, upstream OIDC) off the
    # VPC, so no Cloud NAT is needed.
    dynamic "vpc_access" {
      for_each = var.vpc_network == "" ? [] : [1]
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.vpc_network
          subnetwork = var.vpc_subnet
        }
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      # Named because `gcloud run services update --image` needs
      # `--container` once a service has more than one.
      name  = var.name
      image = var.image
      args  = length(var.args) > 0 ? var.args : null

      ports {
        container_port = var.port
      }

      resources {
        limits = {
          memory = var.memory
          cpu    = var.cpu
        }
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      dynamic "volume_mounts" {
        for_each = var.secret_files
        content {
          name       = volume_mounts.key
          mount_path = volume_mounts.value.mount_dir
        }
      }

      # Cloud Run mounts the Cloud SQL socket itself whenever the volume is
      # attached, so this is declared rather than requested: leaving it out
      # reads as "remove it", and the API puts it straight back.
      dynamic "volume_mounts" {
        for_each = var.cloud_sql_instance == "" ? [] : [var.cloud_sql_instance]
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }

    # Declared after the main container so it stays index 0, which is what the
    # image lifecycle rule below addresses.
    dynamic "containers" {
      for_each = var.sidecars
      content {
        name  = containers.key
        image = containers.value.image
        args  = length(containers.value.args) > 0 ? containers.value.args : null

        # No ports block: Cloud Run publishes exactly one container's port, and
        # that is the main one. A sidecar listens on localhost.
        dynamic "env" {
          for_each = containers.value.env_vars
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = containers.value.secret_env_vars
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }

    dynamic "volumes" {
      for_each = var.secret_files
      content {
        name = volumes.key
        secret {
          secret = volumes.value.secret
          items {
            path    = volumes.value.file
            version = "latest"
          }
        }
      }
    }

    dynamic "volumes" {
      for_each = var.cloud_sql_instance == "" ? [] : [var.cloud_sql_instance]
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [volumes.value]
        }
      }
    }
  }

  # Service-level, not the per-revision block in `template`. Declared because
  # the API reports one either way, so omitting it reads as "remove" and every
  # plan proposes a removal the API then restores. `manual_instance_count` is
  # omitted deliberately: it applies only under MANUAL scaling.
  scaling {
    scaling_mode       = "AUTOMATIC"
    min_instance_count = 0
  }

  lifecycle {
    # The workflow owns the image tag and sync-secrets.yml owns revision labels,
    # since a label write is the only way to ask Cloud Run for a fresh revision.
    # Without this, terraform plans their removal and the deploy's own
    # "infrastructure matches" guard refuses on the non-empty plan.
    ignore_changes = [
      template[0].containers[0].image,
      template[0].labels,
      client,
      client_version,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.allow_public ? 1 : 0

  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invokers)

  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = each.value
}
