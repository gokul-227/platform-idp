// Configuration export/import — assembles a single downloadable bundle
// from the real entities this console already manages (Theme, Flows,
// Plugins, Identity Providers, Roles), and re-applies one back through
// the exact same Python write endpoints every other page in this app
// uses. Not a new store or a new mutation path — just orchestration, the
// same pattern the Application/Organization detail pages already use to
// aggregate several adapters on one page.

import "server-only";

import { getTheme, updateTheme } from "@/adapters/theme-service";
import { listFlows, createFlow, type Flow } from "@/adapters/flow-service";
import { listPlugins, createPlugin, type Plugin } from "@/adapters/plugin-service";
import {
  listIdentityProviders,
  setIdentityProviderEnabled,
  type IdentityProvider,
} from "@/adapters/identity-providers";
import { listRoles, createRole, type Role } from "@/adapters/authorization-service";
import type { Theme } from "@/themes/types";

export interface ConfigurationBundle {
  exported_at: string;
  theme: Theme | null;
  flows: Flow[];
  plugins: Plugin[];
  identityProviders: IdentityProvider[];
  roles: Role[];
}

export async function buildConfigurationBundle(): Promise<ConfigurationBundle> {
  const [theme, flows, plugins, identityProviders, roles] = await Promise.all([
    getTheme(),
    listFlows(),
    listPlugins(),
    listIdentityProviders(),
    listRoles(),
  ]);
  return {
    exported_at: new Date().toISOString(),
    flows,
    identityProviders,
    plugins: plugins.filter((p) => p.source === "config"),
    roles,
    theme,
  };
}

export interface ApplyResult {
  section: string;
  item: string;
  ok: boolean;
  error?: string;
}

// Applies each section independently — one item failing (e.g. a flow ID
// that already exists) doesn't block the rest of the bundle.
export async function applyConfigurationBundle(
  bundle: ConfigurationBundle,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  if (bundle.theme) {
    const result = await updateTheme(bundle.theme);
    results.push({ item: "theme", ok: result.ok, section: "theme", error: result.error });
  }

  for (const flow of bundle.flows ?? []) {
    const result = await createFlow(flow);
    results.push({ item: flow.id, ok: result.ok, section: "flows", error: result.error });
  }

  for (const plugin of bundle.plugins ?? []) {
    const result = await createPlugin(plugin);
    results.push({ item: plugin.id, ok: result.ok, section: "plugins", error: result.error });
  }

  for (const provider of bundle.identityProviders ?? []) {
    const result = await setIdentityProviderEnabled(provider.id, provider.enabled);
    results.push({
      item: provider.id, ok: result.ok, section: "identityProviders", error: result.error,
    });
  }

  for (const role of bundle.roles ?? []) {
    const result = await createRole(role);
    results.push({ item: role.id, ok: result.ok, section: "roles", error: result.error });
  }

  return results;
}

export function validateConfigurationBundleShape(raw: unknown): string[] {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return ["Bundle must be a JSON object."];
  }
  const bundle = raw as Record<string, unknown>;
  if (bundle.flows !== undefined && !Array.isArray(bundle.flows)) {
    errors.push("flows must be an array.");
  }
  if (bundle.plugins !== undefined && !Array.isArray(bundle.plugins)) {
    errors.push("plugins must be an array.");
  }
  if (bundle.identityProviders !== undefined && !Array.isArray(bundle.identityProviders)) {
    errors.push("identityProviders must be an array.");
  }
  if (bundle.roles !== undefined && !Array.isArray(bundle.roles)) {
    errors.push("roles must be an array.");
  }
  if (bundle.theme !== undefined && typeof bundle.theme !== "object") {
    errors.push("theme must be an object.");
  }
  return errors;
}
