# Migrations run as a job inside the VPC, not from CI: this instance has no
# public address and GitHub runners are not in the VPC. It also means the
# migration runs from the same image, config and DSN as the service it precedes.
resource "google_cloud_run_v2_job" "this" {
  project  = var.project
  location = var.region
  name     = var.name

  # A job is meant to be replaceable. Left true, a create that fails partway
  # leaves it tainted and unrecoverable without a state edit, since terraform
  # must destroy what it cannot destroy. The job holds no data.
  deletion_protection = false

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
    template {
      service_account = var.service_account_email
      max_retries     = 1

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.vpc_network
          subnetwork = var.vpc_subnet
        }
      }

      containers {
        image = var.image
        args  = var.args

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
      }
    }
  }

  lifecycle {
    # The deploy workflow owns the image tag, same as the services.
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
}
