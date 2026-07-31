import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { listRegistryApps } from "@/adapters/app-registry";
import { hydraAdmin, identityAdmin, listRelationTuples } from "@/adapters/admin";
import { listAuditEvents } from "@/adapters/audit-service";
import { listRoles, listPolicies } from "@/adapters/authorization-service";
import { listFlows } from "@/adapters/flow-service";
import { getTheme } from "@/adapters/theme-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { Select } from "@/components/vendor/ui/select";
import { PageHeader } from "../../page.header";
import { getTenant } from "@/adapters/tenant-service";
import {
  deleteApplicationDetailAction,
  grantApplicationPermissionAction,
  revokeApplicationPermissionAction,
  rotateApplicationSecretAction,
  setApplicationEnabledDetailAction,
  updateApplicationOAuthAction,
} from "./actions";

async function resolveSubjectLabel(subjectId: string): Promise<string> {
  try {
    const identity = await identityAdmin.getIdentity({ id: subjectId });
    const traits = identity.traits as Record<string, unknown>;
    return typeof traits.email === "string" ? traits.email : subjectId;
  } catch {
    return subjectId;
  }
}

// The single detail experience tying an Application together: its real
// Hydra OAuth2 client (OAuth tab), the real Keto tuples scoped to
// Application:<client_id> (Permissions — same relations as
// namespaces.ts's Application namespace: owner/use), those tuples resolved
// to real Kratos identities (Users), and links into the platform-wide
// Theme/Authentication Flow/Audit surfaces this application participates
// in (all global, not per-application — Kratos/Hydra have no per-client
// theming or flow config, so this deliberately doesn't fake one).
export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { clientId } = await params;
  const query = await searchParams;

  const apps = await listRegistryApps();
  const app = apps.find((a) => a.client_id === clientId);
  if (!app) {
    notFound();
  }

  const [hydraClient, tuples, roles, policies, theme, flows, auditEvents, tenant] =
    await Promise.all([
      hydraAdmin.getOAuth2Client({ id: clientId }).catch(() => null),
      listRelationTuples("Application", clientId),
      listRoles(),
      listPolicies(),
      getTheme(),
      listFlows(),
      listAuditEvents({ resourceId: clientId }),
      app.tenant_id ? getTenant(app.tenant_id) : Promise.resolve(null),
    ]);

  const applicationRoles = roles.filter((r) => r.namespace === "Application");
  const applicationPolicies = policies.filter((p) => p.namespace === "Application" && p.object === clientId);
  const resolvedTuples = await Promise.all(
    tuples
      .filter((t) => t.subject_id)
      .map(async (t) => ({ ...t, label: await resolveSubjectLabel(t.subject_id as string) })),
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description={`Application client_id: ${clientId}`}
        title={app.client_name}
      />

      {/* Overview */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={app.enabled ? "outline" : "secondary"}>
              {app.enabled ? "enabled" : "disabled"}
            </Badge>
            {app.tenant_id ? <Badge variant="outline">tenant: {app.tenant_id}</Badge> : null}
            {app.tags.map((tag) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>
          <p className="text-muted-foreground">Registry file: {app.filename}</p>
          <p className="text-muted-foreground">Scope: {app.scope}</p>
          <p className="text-muted-foreground">
            Redirect URIs: {app.redirect_uris.join(", ") || "none"}
          </p>
        </CardContent>
      </Card>

      {/* OAuth / Redirect URIs / Grant Types / Response Types / Scopes */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">OAuth</CardTitle>
          <p className="text-muted-foreground text-sm">
            Real Hydra OAuth2 client fields — Redirect URIs, Grant Types, Response Types, and
            Scopes are each independently editable below; saving calls Hydra&apos;s real
            <code> PUT /admin/clients/{"{id}"}</code>.
          </p>
        </CardHeader>
        <CardContent>
          {hydraClient ? (
            <form
              action={updateApplicationOAuthAction}
              className="flex flex-col gap-4 text-sm"
            >
              <input name="client_id" type="hidden" value={clientId} />
              <Field>
                <FieldLabel htmlFor="client_name">Client name</FieldLabel>
                <Input defaultValue={hydraClient.client_name} id="client_name" name="client_name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="redirect_uris">Redirect URIs (comma-separated)</FieldLabel>
                <Input
                  defaultValue={(hydraClient.redirect_uris ?? []).join(", ")}
                  id="redirect_uris"
                  name="redirect_uris"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="post_logout_redirect_uris">
                  Post-logout redirect URIs (comma-separated)
                </FieldLabel>
                <Input
                  defaultValue={(hydraClient.post_logout_redirect_uris ?? []).join(", ")}
                  id="post_logout_redirect_uris"
                  name="post_logout_redirect_uris"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="grant_types">Grant types (comma-separated)</FieldLabel>
                <Input
                  defaultValue={(hydraClient.grant_types ?? []).join(", ")}
                  id="grant_types"
                  name="grant_types"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="response_types">Response types (comma-separated)</FieldLabel>
                <Input
                  defaultValue={(hydraClient.response_types ?? []).join(", ")}
                  id="response_types"
                  name="response_types"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="scope">Scope</FieldLabel>
                <Input defaultValue={hydraClient.scope} id="scope" name="scope" />
              </Field>
              <Field>
                <FieldLabel htmlFor="token_endpoint_auth_method">
                  Token endpoint auth method
                </FieldLabel>
                <Select
                  className="w-auto"
                  defaultValue={hydraClient.token_endpoint_auth_method}
                  id="token_endpoint_auth_method"
                  name="token_endpoint_auth_method"
                >
                  <option value="client_secret_post">client_secret_post</option>
                  <option value="client_secret_basic">client_secret_basic</option>
                  <option value="none">none (public client)</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="jwks_uri">JWKS URI (for private_key_jwt clients)</FieldLabel>
                <Input
                  defaultValue={hydraClient.jwks_uri ?? ""}
                  id="jwks_uri"
                  name="jwks_uri"
                  placeholder="https://example.com/.well-known/jwks.json"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="audience">Audience (comma-separated)</FieldLabel>
                <Input
                  defaultValue={(hydraClient.audience ?? []).join(", ")}
                  id="audience"
                  name="audience"
                  placeholder="https://api.example.com"
                />
              </Field>
              <p className="text-muted-foreground text-xs">
                No PKCE toggle: Hydra enforces PKCE automatically for public clients (token
                endpoint auth method &quot;none&quot;) using the authorization_code grant — there
                is no separate on/off field to set. No raw JWKS document upload here either —
                Hydra supports one, but this console only exposes a hosted JWKS URI for now.
              </p>

              <div className="border-t pt-4">
                <p className="mb-2 font-medium">Token configuration</p>
                <p className="mb-2 text-muted-foreground text-xs">
                  Real per-client Hydra TTL overrides (e.g. <code>1h</code>, <code>24h</code>).
                  Leave blank to use Hydra&apos;s global default.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="ac_access_ttl">
                      Auth code grant — access token TTL
                    </FieldLabel>
                    <Input
                      defaultValue={hydraClient.authorization_code_grant_access_token_lifespan ?? ""}
                      id="ac_access_ttl"
                      name="ac_access_ttl"
                      placeholder="e.g. 1h"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ac_id_ttl">Auth code grant — ID token TTL</FieldLabel>
                    <Input
                      defaultValue={hydraClient.authorization_code_grant_id_token_lifespan ?? ""}
                      id="ac_id_ttl"
                      name="ac_id_ttl"
                      placeholder="e.g. 1h"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ac_refresh_ttl">
                      Auth code grant — refresh token TTL
                    </FieldLabel>
                    <Input
                      defaultValue={hydraClient.authorization_code_grant_refresh_token_lifespan ?? ""}
                      id="ac_refresh_ttl"
                      name="ac_refresh_ttl"
                      placeholder="e.g. 720h"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cc_access_ttl">
                      Client credentials grant — access token TTL
                    </FieldLabel>
                    <Input
                      defaultValue={hydraClient.client_credentials_grant_access_token_lifespan ?? ""}
                      id="cc_access_ttl"
                      name="cc_access_ttl"
                      placeholder="e.g. 1h"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rt_access_ttl">
                      Refresh token grant — access token TTL
                    </FieldLabel>
                    <Input
                      defaultValue={hydraClient.refresh_token_grant_access_token_lifespan ?? ""}
                      id="rt_access_ttl"
                      name="rt_access_ttl"
                      placeholder="e.g. 1h"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rt_id_ttl">Refresh token grant — ID token TTL</FieldLabel>
                    <Input
                      defaultValue={hydraClient.refresh_token_grant_id_token_lifespan ?? ""}
                      id="rt_id_ttl"
                      name="rt_id_ttl"
                      placeholder="e.g. 1h"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rt_refresh_ttl">
                      Refresh token grant — refresh token TTL
                    </FieldLabel>
                    <Input
                      defaultValue={hydraClient.refresh_token_grant_refresh_token_lifespan ?? ""}
                      id="rt_refresh_ttl"
                      name="rt_refresh_ttl"
                      placeholder="e.g. 720h"
                    />
                  </Field>
                </div>
              </div>

              <Button className="w-fit" type="submit">Save</Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">
              No matching Hydra client found (registry entry not yet synced — enable it to sync).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Secrets */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Secrets</CardTitle>
          <p className="text-muted-foreground text-sm">
            Rotating generates a new real Hydra client_secret — the previous one stops working
            immediately (Hydra only ever stores one secret hash per client). Shown once, right
            here, same as the Clients page's rotate-secret flow.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {hydraClient ? (
            <form action={rotateApplicationSecretAction}>
              <input name="client_id" type="hidden" value={clientId} />
              <Button size="sm" type="submit" variant="outline">
                Rotate secret
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">No Hydra client to rotate a secret for.</p>
          )}
          {query.rotated_secret ? (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-sm">New client secret:</p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {query.rotated_secret}
              </code>
            </div>
          ) : null}
          {query.error ? <p className="text-destructive text-sm">{query.error}</p> : null}
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Permissions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Real Keto relation tuples on <code>Application:{clientId}</code>. Roles catalog
            entries scoped to the Application namespace: {applicationRoles.map((r) => r.relation).join(", ") || "none defined"}.
          </p>
          {applicationPolicies.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {applicationPolicies.length} of these tuple(s) also have a named Role via{" "}
              <a className="underline" href="/auth/console/policies">/console/policies</a>.
            </p>
          ) : null}
          <form action={grantApplicationPermissionAction} className="flex flex-wrap items-end gap-4">
            <input name="client_id" type="hidden" value={clientId} />
            <Field>
              <FieldLabel htmlFor="relation">Relation</FieldLabel>
              <Select id="relation" name="relation">
                <option value="owner">owner</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="subject_id">Identity ID</FieldLabel>
              <Input id="subject_id" name="subject_id" required />
            </Field>
            <Button size="sm" type="submit">Grant</Button>
          </form>
          {resolvedTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm">No permissions granted.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {resolvedTuples.map((t) => (
                <div className="flex items-center justify-between text-sm" key={`${t.relation}-${t.subject_id}`}>
                  <span>
                    <Badge variant="outline">{t.relation}</Badge>{" "}
                    <span className="font-mono text-xs">{t.subject_id}</span>
                  </span>
                  <form action={revokeApplicationPermissionAction}>
                    <input name="client_id" type="hidden" value={clientId} />
                    <input name="relation" type="hidden" value={t.relation} />
                    <ConfirmSubmitButton
                      description={`This removes the ${t.relation} relation for ${t.subject_id} on this application. They lose whatever access that relation granted.`}
                      name="subject_id"
                      title="Revoke this permission?"
                      value={t.subject_id ?? ""}
                    >
                      Revoke
                    </ConfirmSubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Identities resolved from this application's Keto tuples above (same data, shown by
            real Kratos identity email instead of raw subject id).
          </p>
          {resolvedTuples.length === 0 ? (
            <p className="text-muted-foreground text-sm mt-2">No users with direct access.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {resolvedTuples.map((t) => (
                <li key={`${t.relation}-${t.subject_id}`}>
                  {t.label} — <Badge variant="outline">{t.relation}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Organizations */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Organizations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {tenant ? (
            <p>
              Owned by{" "}
              <Link className="underline" href={`/console/organizations/${tenant.id}`}>
                {tenant.name}
              </Link>{" "}
              (real <code>registry/apps/*.yaml</code> <code>tenant_id</code> field).
            </p>
          ) : (
            <p className="text-muted-foreground">
              Not scoped to an organization (no <code>tenant_id</code> set on this registry
              entry).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Theme</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            Kratos/Hydra have no per-application theming — the active theme below is global,
            applied to every application's self-service pages. Manage it at{" "}
            <a className="underline" href="/auth/console/themes">/console/themes</a>.
          </p>
          {theme ? (
            <p className="mt-2">Active theme: <span className="font-medium">{theme.productName}</span></p>
          ) : (
            <p className="mt-2 text-muted-foreground">Theme service unreachable.</p>
          )}
        </CardContent>
      </Card>

      {/* Authentication Flow */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Authentication Flow</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            Authentication flows are global Kratos self-service configuration, not per-application
            — every application shares the same enabled flows below.
          </p>
          {flows.length === 0 ? (
            <p className="mt-2 text-muted-foreground">No flows found.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {flows.map((flow) => (
                <li key={flow.id}>
                  <Badge variant={flow.enabled ? "outline" : "secondary"}>
                    {flow.enabled ? "enabled" : "disabled"}
                  </Badge>{" "}
                  {flow.name} ({flow.type})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Audit / History */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Audit / History</CardTitle>
          <p className="text-muted-foreground text-sm">
            Every real mutation to this application (registry field changes, enable/disable,
            secret rotation, permission grants) — one real event log, not two.
          </p>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit events for this application yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {auditEvents.map((event) => (
                <li className="flex items-center justify-between" key={event.id}>
                  <span>{event.action}</span>
                  <span className="text-muted-foreground text-xs">{event.created_at}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Link
            className="text-sm underline"
            href={`/console/applications/${encodeURIComponent(clientId)}/edit`}
          >
            Edit registry fields
          </Link>
          <form action={setApplicationEnabledDetailAction}>
            <input name="client_id" type="hidden" value={clientId} />
            <input name="enabled" type="hidden" value={app.enabled ? "false" : "true"} />
            <Button size="sm" type="submit" variant="outline">
              {app.enabled ? "Disable" : "Enable"}
            </Button>
          </form>
          <form action={deleteApplicationDetailAction}>
            <ConfirmSubmitButton
              description="This removes the application from registry/apps/*.yaml and deletes its Hydra OAuth2 client. Any real application using it will immediately be unable to authenticate. This cannot be undone."
              name="client_id"
              title="Delete this application?"
              value={clientId}
            >
              Delete application
            </ConfirmSubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
