// Environment resolution for this app. Mirrors the pattern used by
// vendor/kratos-selfservice-ui-reference's auth-ui service (see
// deployment/docker/compose/docker-compose.dev.yml's `auth-ui` service) and
// .reference/platform-ory-id-spike/apps/id/src/lib/env.ts: server-side calls
// hit Kratos directly (fast, no edge hop needed for a trusted internal
// call); browser-facing URLs go back through Oathkeeper, since only
// Oathkeeper is exposed publicly.
//
// Defaults below target the already-running local stack directly
// (localhost:4433/4455) for standalone `npm run dev` use before this app is
// wired into Docker Compose (Milestone 6). Once containerized, set
// KRATOS_PUBLIC_URL=http://kratos:4433 (the Docker network hostname) to
// match how auth-ui's own environment is configured.

export interface Env {
  kratosPublicUrl: string;
  kratosBrowserUrl: string;
  kratosAdminUrl: string;
  hydraAdminUrl: string;
  ketoReadUrl: string;
  appRegistryUrl: string;
  consoleApiUrl: string;
  tenantServiceUrl: string;
  auditServiceUrl: string;
  pluginServiceUrl: string;
  flowServiceUrl: string;
  notificationServiceUrl: string;
  authorizationServiceUrl: string;
  hooksServiceUrl: string;
  oathkeeperAdminUrl: string;
  publicBaseUrl: string;
}

export function getEnv(): Env {
  return {
    kratosPublicUrl: process.env.KRATOS_PUBLIC_URL ?? "http://localhost:4433",
    kratosBrowserUrl:
      process.env.KRATOS_BROWSER_URL ??
      "http://localhost:4455/.ory/kratos/public",
    // Admin APIs — server-side only, never exposed to the browser (see
    // adapters/admin.ts). Console pages call these directly.
    kratosAdminUrl: process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434",
    hydraAdminUrl: process.env.HYDRA_ADMIN_URL ?? "http://localhost:4445",
    ketoReadUrl: process.env.KETO_READ_URL ?? "http://localhost:4466",
    // platform/app-registry — the one Python service that owns writes to
    // integrations/applications/*.yaml + the Hydra clients they produce. The console
    // never mutates Hydra or registry files itself; it only calls this API.
    appRegistryUrl: process.env.APP_REGISTRY_URL ?? "http://localhost:8080",
    // platform/console-api — owns every /console/* mutation that isn't an
    // Applications enable/disable (identities, sessions, clients,
    // permissions). Same "Python owns admin operations" rule as above.
    consoleApiUrl: process.env.CONSOLE_API_URL ?? "http://localhost:8086",
    // platform/tenant-service — the existing multi-tenancy CRUD service.
    // Organizations reuses this directly as the entity's source of truth
    // (Postgres, name/domain/status) rather than inventing a new store;
    // membership (admin/member/billing_admin) is Keto Organization
    // relation tuples, via the same console-api endpoints Permissions uses.
    tenantServiceUrl: process.env.TENANT_SERVICE_URL ?? "http://localhost:8081",
    // platform/audit-service — read-only for the console's Audit Logs page;
    // console-api is the one writing events, not this app.
    auditServiceUrl: process.env.AUDIT_SERVICE_URL ?? "http://localhost:8087",
    // platform/plugin-service — the generic plugin registry behind
    // /console/plugins. Distinct from platform/plugin-framework (a
    // code-loading strategy pattern, not exposed to this app at all).
    pluginServiceUrl: process.env.PLUGIN_SERVICE_URL ?? "http://localhost:8088",
    // platform/flow-service — authentication flow definitions behind
    // /console/flows.
    flowServiceUrl: process.env.FLOW_SERVICE_URL ?? "http://localhost:8089",
    // platform/notification-service — template editor + test-send behind
    // /console/notifications.
    notificationServiceUrl:
      process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:8085",
    // platform/authorization-service — Roles/Policies control-plane over
    // real Keto tuples behind /console/roles and /console/policies.
    authorizationServiceUrl:
      process.env.AUTHORIZATION_SERVICE_URL ?? "http://localhost:8090",
    // platform/hooks — owns the one first-admin bootstrap endpoint
    // (POST /admin/bootstrap) behind /setup; see app/setup/page.tsx.
    hooksServiceUrl: process.env.HOOKS_SERVICE_URL ?? "http://localhost:8082",
    // Server-side only — the console Dashboard's own service-health check.
    // Deliberately NOT derived from publicBaseUrl below: that's the
    // browser-facing origin (localhost:4455), and a server-side request to
    // "localhost:4456" from inside this container hits its own loopback,
    // not Oathkeeper — confirmed live (a real bug, fixed by adding this
    // proper internal-network URL instead of string-replacing the public one).
    oathkeeperAdminUrl: process.env.OATHKEEPER_ADMIN_URL ?? "http://localhost:4456",
    // The browser-facing origin (through Oathkeeper) — needed to build an
    // absolute redirect_uri for the Developer Portal's Authorization Code
    // + PKCE playground, since Hydra requires a pre-registered absolute
    // URL, not a relative path.
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:4455",
  };
}
