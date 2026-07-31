# =============================================================================
# Enterprise Identity Platform — Makefile
# =============================================================================
# Provides a unified interface for all platform operations.
# Run `make help` to see all available targets.
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help

# ─── Variables ───────────────────────────────────────────────────────────────
PLATFORM_VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
PLATFORM_COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
PLATFORM_DATE       ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
COMPOSE_FILE        ?= deployment/docker/compose/docker-compose.yml
COMPOSE_DEV_FILE    ?= deployment/docker/compose/docker-compose.dev.yml
COMPOSE_OBS_FILE    ?= deployment/docker/compose/docker-compose.observability.yml
COMPOSE_APPS_FILE   ?= deployment/docker/compose/docker-compose.applications.yml
DOCKER_REGISTRY     ?= ghcr.io/your-org
IMAGE_TAG           ?= $(PLATFORM_VERSION)

# ─── Colors ──────────────────────────────────────────────────────────────────
RESET   := \033[0m
BOLD    := \033[1m
RED     := \033[31m
GREEN   := \033[32m
YELLOW  := \033[33m
BLUE    := \033[34m
MAGENTA := \033[35m
CYAN    := \033[36m

define log
	@printf "$(BOLD)$(CYAN)[EIP]$(RESET) $(1)\n"
endef

define success
	@printf "$(BOLD)$(GREEN)[✓]$(RESET) $(1)\n"
endef

define warn
	@printf "$(BOLD)$(YELLOW)[!]$(RESET) $(1)\n"
endef

define error
	@printf "$(BOLD)$(RED)[✗]$(RESET) $(1)\n"
endef

# =============================================================================
# HELP
# =============================================================================

help: ## Show this help message
	@printf "\n$(BOLD)$(BLUE)Enterprise Identity Platform$(RESET) — $(PLATFORM_VERSION)\n\n"
	@printf "$(BOLD)Usage:$(RESET)\n"
	@printf "  make $(CYAN)<target>$(RESET)\n\n"
	@printf "$(BOLD)Targets:$(RESET)\n"
	@awk 'BEGIN {FS = ":.*##"; printf ""} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(CYAN)%-28s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@printf "\n"

# =============================================================================
# PLATFORM LIFECYCLE
# =============================================================================

##@ Platform Lifecycle

up: ## Start the full platform stack (local development)
	$(call log, Starting Enterprise Identity Platform...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) up -d
	$(call success, Platform started)
	@$(MAKE) health

up-applications: ## Start platform + optional application plugins (JupyterHub, Airflow, Superset)
	$(call log, Starting platform with application plugins...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) -f $(COMPOSE_APPS_FILE) up -d --build
	$(call success, Platform with applications started)

up-full: ## Start platform + observability stack
	$(call log, Starting platform with full observability...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) -f $(COMPOSE_OBS_FILE) up -d
	$(call success, Full stack started)

down: ## Stop all services
	$(call log, Stopping platform...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) -f $(COMPOSE_APPS_FILE) -f $(COMPOSE_OBS_FILE) down
	$(call success, Platform stopped)

restart: ## Restart all services
	$(call log, Restarting platform...)
	@$(MAKE) down
	@$(MAKE) up

destroy: ## Stop and remove all data (DESTRUCTIVE)
	$(call warn, This will destroy all platform data!)
	@read -p "Are you sure? Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) -f $(COMPOSE_APPS_FILE) -f $(COMPOSE_OBS_FILE) down -v --remove-orphans
	$(call success, Platform destroyed)

reset: ## Wipe platform DATA only (drops volumes) and start fresh — identities/tokens/tuples are gone, the repo/images are not
	$(call warn, This will erase all identities, sessions, and OAuth2 clients!)
	@read -p "Are you sure? Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) down -v
	@$(MAKE) up
	$(call success, Platform reset — fresh empty databases)

logs: ## Stream logs from all services
	@docker compose --env-file .env -f $(COMPOSE_FILE) logs -f --tail=100

logs-kratos: ## Stream Kratos logs
	@docker compose --env-file .env -f $(COMPOSE_FILE) logs -f kratos

logs-hydra: ## Stream Hydra logs
	@docker compose --env-file .env -f $(COMPOSE_FILE) logs -f hydra

logs-keto: ## Stream Keto logs
	@docker compose --env-file .env -f $(COMPOSE_FILE) logs -f keto

logs-oathkeeper: ## Stream Oathkeeper logs
	@docker compose --env-file .env -f $(COMPOSE_FILE) logs -f oathkeeper

status: ## Show service status
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_OBS_FILE) ps

shell: ## Open a shell in a service (SERVICE=kratos)
	@docker compose --env-file .env -f $(COMPOSE_FILE) exec $(SERVICE) sh

# =============================================================================
# HEALTH
# =============================================================================

##@ Health & Diagnostics

health: ## Check health of all services
	$(call log, Checking platform health...)
	@automation/health/health-check.sh

doctor: ## Diagnose platform issues
	$(call log, Running platform diagnostics...)
	@automation/health/doctor.sh

validate: ## Validate configuration, scripts, Compose, Kustomize, and Python packages (all in containers)
	$(call log, Validating repository baseline...)
	@find automation -type f -name '*.sh' -exec bash -n {} \;
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) config -q
	@kubectl kustomize deployment/kubernetes/base --load-restrictor LoadRestrictionsNone >/dev/null
	@$(MAKE) validate-tools
	@$(MAKE) lint-python
	$(call success, Repository baseline is valid)

validate-tools: ## Validate configuration/integrations YAML+JSON against their schemas (automation/validation/validate_config.py, in a container)
	@docker build -q -f deployment/docker/configs/python-dev.Dockerfile -t tools-dev . >/dev/null
	@docker run --rm tools-dev sh -c "uv run python -m automation.validation.validate_config && uv run ruff check automation/validation tests/unit && uv run ruff format --check automation/validation tests/unit && uv run mypy && uv run pytest"

# =============================================================================
# SETUP
# =============================================================================

##@ Setup

setup: ## Initial platform setup (run once)
	$(call log, Setting up Enterprise Identity Platform...)
	@$(MAKE) setup-env
	@$(MAKE) setup-deps
	@$(MAKE) setup-hooks
	$(call success, Setup complete. Run 'make up' to start.)

setup-env: ## Copy .env.example to .env (if not exists)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		$(call success, Created .env from .env.example); \
	else \
		$(call warn, .env already exists — skipping); \
	fi

setup-deps: ## Install all dependencies
	$(call log, Building dependency images...)
	@$(MAKE) install-node-deps
	@$(MAKE) install-python-service-deps
	$(call success, Dependencies installed)

setup-hooks: ## Install git pre-commit hooks
	$(call log, Installing pre-commit hooks...)
	@pre-commit install
	@pre-commit install --hook-type commit-msg
	$(call success, Hooks installed)

# Node.js was a transitional state for services not yet ported to Python per
# ADR-0012 — all platform/* services have now been ported; this list is
# intentionally empty and kept only so lint-ts/format-ts/build-services have
# something to iterate if a future platform service is ever added in Node.
NODE_PLATFORM_SERVICES :=
# Services ported to Python per ADR-0012 (all current platform/* services,
# plus the shared plugin-framework library — see docs/10-reference/adr/ADR-0004).
PYTHON_PLATFORM_SERVICES := platform/hooks platform/app-registry platform/auth-service platform/tenant-service platform/email-service platform/notification-service platform/plugin-framework platform/console-api platform/audit-service platform/authorization-service platform/flow-service platform/plugin-service

# ─── Container-first Python tooling ────────────────────────────────────────
# No local Python/uv/venv is required on the host — every lint/format/mypy/
# test/Alembic invocation for a Python package runs inside its own `dev`
# Docker image. automation/docker/docker-build-python-dev.sh knows each package's build
# context/Dockerfile quirks (app-registry and email-service need repo-root
# context; plugin-framework has no Dockerfile of its own) and prints the
# resulting image tag; automation/docker/docker-workdir-python.sh prints that image's
# WORKDIR so format-python can bind-mount src/tests at the right path.

install-node-deps: ## Install Node.js dependencies for services not yet ported to Python
	$(call log, Installing Node.js dependencies...)
	@for dir in $(NODE_PLATFORM_SERVICES); do \
		if [ -f "$$dir/package.json" ]; then \
			echo "  → $$dir"; \
			cd $$dir && npm ci --prefer-offline && cd -; \
		fi; \
	done

install-python-service-deps: ## Build the dev image for every Python platform package (installs deps inside the image)
	$(call log, Building Python service dev images...)
	@set -e; for dir in $(PYTHON_PLATFORM_SERVICES); do \
		echo "  → $$dir"; \
		automation/docker/docker-build-python-dev.sh $$dir; \
	done

# =============================================================================
# BUILD
# =============================================================================

##@ Build

build: build-services ## Build all components (Python services have no separate build step — see install-python-service-deps)
	$(call success, All components built)

build-services: ## Build remaining Node platform services (TypeScript)
	$(call log, Building platform services...)
	@for dir in $(NODE_PLATFORM_SERVICES); do \
		if [ -f "$$dir/package.json" ]; then \
			echo "  → $$dir"; \
			cd $$dir && npm run build && cd -; \
		fi; \
	done

build-images: ## Build all Docker images
	$(call log, Building Docker images...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) build --parallel

push-images: ## Push Docker images to registry
	$(call log, Pushing images to $(DOCKER_REGISTRY)...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) push

# =============================================================================
# TESTS
# =============================================================================

##@ Testing

test: ## Run all tests
	$(call log, Running all tests...)
	@$(MAKE) test-unit
	@$(MAKE) test-integration
	$(call success, All tests passed)

test-unit: ## Run unit tests
	$(call log, Running unit tests...)
	@for dir in $(NODE_PLATFORM_SERVICES); do \
		if [ -f "$$dir/package.json" ]; then \
			cd $$dir && npm test && cd -; \
		fi; \
	done
	@$(MAKE) test-python-services

test-e2e: ## Run end-to-end identity-lifecycle tests against a RUNNING stack (containerized)
	$(call log, Running E2E tests (needs make up first)...)
	@docker run --rm --network host \
		-v "$(PWD)/tests/e2e:/t:ro" \
		-e EIP_BASE_URL="$(or $(EIP_BASE_URL),http://localhost:4455)" \
		-e EIP_MAILHOG_URL="$(or $(EIP_MAILHOG_URL),http://localhost:8025)" \
		python:3.13-slim sh -c "pip install -q httpx pytest && cp /t/*.py /tmp/ && cd /tmp && pytest test_identity_lifecycle.py -p no:cacheprovider -q"

test-e2e-platform: ## Run extended Ory platform verification (Hydra, Keto, Oathkeeper, observability)
	$(call log, Running extended platform E2E (needs make up-full first)...)
	@docker run --rm --network host \
		-v "$(PWD)/tests/e2e:/t:ro" \
		-e EIP_BASE_URL="$(or $(EIP_BASE_URL),http://localhost:4455)" \
		-e EIP_MAILHOG_URL="$(or $(EIP_MAILHOG_URL),http://localhost:8025)" \
		-e EIP_PROMETHEUS_URL="$(or $(EIP_PROMETHEUS_URL),http://localhost:9090)" \
		-e EIP_GRAFANA_URL="$(or $(EIP_GRAFANA_URL),http://localhost:3001)" \
		-e EIP_LOKI_URL="$(or $(EIP_LOKI_URL),http://localhost:3100)" \
		-e EIP_TEMPO_URL="$(or $(EIP_TEMPO_URL),http://localhost:3200)" \
		-e EIP_HYDRA_ADMIN_URL="$(or $(EIP_HYDRA_ADMIN_URL),http://localhost:4445)" \
		-e EIP_KETO_READ_URL="$(or $(EIP_KETO_READ_URL),http://localhost:4466)" \
		-e EIP_KETO_WRITE_URL="$(or $(EIP_KETO_WRITE_URL),http://localhost:4467)" \
		-e JUPYTERHUB_OIDC_CLIENT_SECRET="$(JUPYTERHUB_OIDC_CLIENT_SECRET)" \
		-e SUPERSET_OIDC_CLIENT_SECRET="$(SUPERSET_OIDC_CLIENT_SECRET)" \
		-e AIRFLOW_OIDC_CLIENT_SECRET="$(AIRFLOW_OIDC_CLIENT_SECRET)" \
		python:3.13-slim sh -c "pip install -q httpx pytest && cp /t/*.py /tmp/ && cd /tmp && pytest test_ory_platform.py test_application_plugins.py -p no:cacheprovider -q"

test-smoke: ## Fast health-only tripwire across every platform service + console page (containerized)
	$(call log, Running smoke tests (needs make up first)...)
	@docker run --rm --network host \
		-v "$(PWD)/tests/smoke:/t:ro" \
		-e EIP_BASE_URL="$(or $(EIP_BASE_URL),http://localhost:4455)" \
		python:3.13-slim sh -c "pip install -q httpx pytest && cp /t/*.py /tmp/ && cd /tmp && pytest test_smoke.py -p no:cacheprovider -q"

test-integration: ## Real cross-service flows (Role/Policy -> Keto, Invitation accept -> Keto, Flow publish) (containerized)
	$(call log, Running integration tests (needs make up first)...)
	@docker run --rm --network host \
		-v "$(PWD)/tests/integration:/t:ro" \
		-e EIP_TENANT_SERVICE_URL="$(or $(EIP_TENANT_SERVICE_URL),http://localhost:8081)" \
		-e EIP_AUTHORIZATION_SERVICE_URL="$(or $(EIP_AUTHORIZATION_SERVICE_URL),http://localhost:8090)" \
		-e EIP_CONSOLE_API_URL="$(or $(EIP_CONSOLE_API_URL),http://localhost:8086)" \
		-e EIP_KETO_READ_URL="$(or $(EIP_KETO_READ_URL),http://localhost:4466)" \
		-e EIP_FLOW_SERVICE_URL="$(or $(EIP_FLOW_SERVICE_URL),http://localhost:8089)" \
		python:3.13-slim sh -c "pip install -q httpx pytest && cp /t/*.py /tmp/ && cd /tmp && pytest test_cross_service_flows.py -p no:cacheprovider -q"

test-performance: ## Basic real-endpoint latency checks (containerized) — NOT a load-testing harness, see tests/performance/test_latency.py
	$(call log, Running basic latency checks (needs make up first)...)
	@docker run --rm --network host \
		-v "$(PWD)/tests/performance:/t:ro" \
		-e EIP_BASE_URL="$(or $(EIP_BASE_URL),http://localhost:4455)" \
		python:3.13-slim sh -c "pip install -q httpx pytest && cp /t/*.py /tmp/ && cd /tmp && pytest test_latency.py -p no:cacheprovider -q"

test-security: ## Real security-boundary checks (containerized) — see tests/security/test_security.py
	$(call log, Running security tests (needs make up first)...)
	@docker run --rm --network host \
		-v "$(PWD)/tests/security:/t:ro" \
		-e EIP_BASE_URL="$(or $(EIP_BASE_URL),http://localhost:4455)" \
		python:3.13-slim sh -c "pip install -q httpx pytest && cp /t/*.py /tmp/ && cd /tmp && pytest test_security.py -p no:cacheprovider -q"

test-python-services: ## Run pytest for every ported Python platform service (in containers)
	$(call log, Running Python service tests...)
	@set -e; for dir in $(PYTHON_PLATFORM_SERVICES); do \
		echo "  → $$dir"; \
		tag=$$(automation/docker/docker-build-python-dev.sh $$dir); \
		docker run --rm $$tag uv run pytest -q; \
	done

# =============================================================================
# CODE QUALITY
# =============================================================================

##@ Code Quality

lint: ## Run all linters
	$(call log, Running linters...)
	@$(MAKE) lint-python
	@$(MAKE) lint-ts
	@$(MAKE) lint-yaml
	@$(MAKE) lint-terraform
	$(call success, All lints passed)

lint-python: ## Lint and type-check every ported Python platform service (in containers)
	@set -e; for dir in $(PYTHON_PLATFORM_SERVICES); do \
		echo "  → $$dir"; \
		tag=$$(automation/docker/docker-build-python-dev.sh $$dir); \
		docker run --rm $$tag sh -c "uv run ruff check . && uv run ruff format --check . && uv run mypy"; \
	done

lint-ts: ## Lint TypeScript code
	@for dir in $(NODE_PLATFORM_SERVICES); do \
		if [ -f "$$dir/package.json" ]; then \
			cd $$dir && npm run lint && cd -; \
		fi; \
	done

lint-yaml: ## Lint YAML files
	@yamllint -c .yamllint.yml .

lint-terraform: ## Lint Terraform code
	@cd terraform && terraform fmt -check -recursive && cd -
	@tflint --recursive

lint-helm: ## Lint Helm charts
	@helm lint deployment/helm/charts/*

format: ## Format all code
	$(call log, Formatting code...)
	@$(MAKE) format-python
	@$(MAKE) format-ts
	@$(MAKE) format-terraform

format-python: ## Format every ported Python platform service (in containers, writing back to disk)
	@set -e; for dir in $(PYTHON_PLATFORM_SERVICES); do \
		echo "  → $$dir"; \
		tag=$$(automation/docker/docker-build-python-dev.sh $$dir); \
		workdir=$$(automation/docker/docker-workdir-python.sh $$dir); \
		mounts="-v $$(pwd)/$$dir/src:$$workdir/src"; \
		[ -d "$$dir/tests" ] && mounts="$$mounts -v $$(pwd)/$$dir/tests:$$workdir/tests"; \
		docker run --rm $$mounts $$tag sh -c "cd $$workdir && uv run ruff format ."; \
	done

format-ts: ## Format TypeScript code
	@for dir in $(NODE_PLATFORM_SERVICES); do \
		if [ -f "$$dir/package.json" ]; then \
			cd $$dir && npm run format && cd -; \
		fi; \
	done

format-terraform: ## Format Terraform code
	@cd terraform && terraform fmt -recursive && cd -

security-scan: ## Run security vulnerability scan
	$(call log, Running security scans...)
	@trivy fs . --exit-code 1 --severity HIGH,CRITICAL
	$(call success, Security scan complete)

pre-commit: ## Run pre-commit hooks on all files
	@pre-commit run --all-files

# =============================================================================
# APPLICATION REGISTRY
# =============================================================================

##@ Application Registry

sync: ## Sync application registry (create/update Hydra clients) — requires `make up`
	$(call log, Syncing application registry...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) run --rm --entrypoint app-registry-cli app-registry sync
	$(call success, Registry synced)

sync-dry-run: ## Dry-run application registry sync — requires `make up`
	$(call log, Dry-run registry sync...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) run --rm --entrypoint app-registry-cli app-registry sync --dry-run

apps: ## List registered applications — requires `make up`
	@docker compose --env-file .env -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) run --rm --entrypoint app-registry-cli app-registry list

# =============================================================================
# DATABASE
# =============================================================================

##@ Database

migrate: ## Run all database migrations
	$(call log, Running database migrations...)
	@docker compose --env-file .env -f $(COMPOSE_FILE) run --rm kratos-migrate
	@docker compose --env-file .env -f $(COMPOSE_FILE) run --rm hydra-migrate
	@docker compose --env-file .env -f $(COMPOSE_FILE) run --rm keto-migrate
	$(call success, Migrations complete)

migrate-kratos: ## Run Kratos database migrations
	@docker compose --env-file .env -f $(COMPOSE_FILE) run --rm kratos-migrate

migrate-hydra: ## Run Hydra database migrations
	@docker compose --env-file .env -f $(COMPOSE_FILE) run --rm hydra-migrate

migrate-keto: ## Run Keto database migrations
	@docker compose --env-file .env -f $(COMPOSE_FILE) run --rm keto-migrate

db-shell-kratos: ## Open PostgreSQL shell for Kratos database
	@docker compose --env-file .env -f $(COMPOSE_FILE) exec postgres-kratos psql -U kratos -d kratos

db-shell-hydra: ## Open PostgreSQL shell for Hydra database
	@docker compose --env-file .env -f $(COMPOSE_FILE) exec postgres-hydra psql -U hydra -d hydra

# =============================================================================
# BACKUP & RESTORE
# =============================================================================

##@ Backup & Restore

backup: ## Backup all platform data
	$(call log, Starting backup...)
	@automation/backup/backup.sh
	$(call success, Backup complete)

restore: ## Restore from backup (BACKUP_FILE=./backups/xxx.tar.gz)
	$(call warn, This will restore from $(BACKUP_FILE))
	@read -p "Continue? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
	@automation/backup/restore.sh $(BACKUP_FILE)
	$(call success, Restore complete)

# =============================================================================
# KUBERNETES
# =============================================================================

##@ Kubernetes

k8s-apply: ## Apply Kubernetes manifests (ENV=dev|staging|prod)
	$(call log, Applying K8s manifests for $(ENV)...)
	@kubectl apply -k deployment/kubernetes/overlays/$(ENV)

k8s-diff: ## Diff Kubernetes manifests (ENV=dev|staging|prod)
	@kubectl diff -k deployment/kubernetes/overlays/$(ENV)

k8s-delete: ## Delete Kubernetes resources (ENV=dev|staging|prod)
	$(call warn, Deleting K8s resources for $(ENV))
	@read -p "Continue? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
	@kubectl delete -k deployment/kubernetes/overlays/$(ENV)

helm-install: ## Install Helm chart (ENV=dev|staging|prod)
	$(call log, Installing Helm chart for $(ENV)...)
	@helm upgrade --install identity-platform deployment/helm/platform \
		-f deployment/helm/environments/$(ENV)/values.yaml \
		--namespace identity-platform \
		--create-namespace \
		--wait

helm-diff: ## Diff Helm release (ENV=dev|staging|prod)
	@helm diff upgrade identity-platform deployment/helm/platform \
		-f deployment/helm/environments/$(ENV)/values.yaml \
		--namespace identity-platform

helm-uninstall: ## Uninstall Helm release (ENV=dev|staging|prod)
	$(call warn, Uninstalling Helm release for $(ENV))
	@helm uninstall identity-platform --namespace identity-platform

# =============================================================================
# TERRAFORM
# =============================================================================

##@ Terraform

tf-init: ## Initialize Terraform (ENV=dev|staging|prod)
	@cd terraform/environments/$(ENV) && terraform init && cd -

tf-plan: ## Terraform plan (ENV=dev|staging|prod)
	@cd terraform/environments/$(ENV) && terraform plan -var-file=terraform.tfvars.example && cd -

tf-apply: ## Terraform apply (ENV=dev|staging|prod)
	$(call warn, Applying Terraform for $(ENV))
	@cd terraform/environments/$(ENV) && terraform apply && cd -

tf-destroy: ## Terraform destroy (ENV=dev|staging|prod)
	$(call warn, Destroying Terraform infrastructure for $(ENV))
	@cd terraform/environments/$(ENV) && terraform destroy && cd -

# =============================================================================
# DOCUMENTATION
# =============================================================================

##@ Documentation

docs: ## Generate and serve documentation
	$(call log, Serving documentation...)
	@cd docs && mkdocs serve && cd -

docs-build: ## Build documentation
	@cd docs && mkdocs build && cd -

# =============================================================================
# UTILITIES
# =============================================================================

##@ Utilities

version: ## Show platform version
	@echo "Enterprise Identity Platform"
	@echo "Version:  $(PLATFORM_VERSION)"
	@echo "Commit:   $(PLATFORM_COMMIT)"
	@echo "Built:    $(PLATFORM_DATE)"

clean: ## Clean build artifacts
	$(call log, Cleaning build artifacts...)
	@rm -rf bin/
	@find . -name "dist" -type d -not -path "*/node_modules/*" | xargs rm -rf
	@find . -name ".next" -type d | xargs rm -rf
	@find . -name "coverage" -type d | xargs rm -rf
	@find . -name "*.out" | xargs rm -f
	$(call success, Clean complete)

gen-jwks: ## Generate JWK keys for Hydra
	$(call log, Generating JWK keys...)
	@automation/setup/generate-jwks.sh

gen-certs: ## Generate self-signed TLS certificates for local dev
	$(call log, Generating self-signed TLS certificates...)
	@automation/setup/generate-certs.sh

check-tools: ## Verify required tools are installed
	@automation/health/check-tools.sh
