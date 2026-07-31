// Loads the active Theme from a YAML config file — plain Node `fs`, not a
// bundler import, so none of the Turbopack file:-dependency resolution
// issues documented in components/vendor/ui/button.tsx apply here; a config
// file is just data, not a module. THEME_CONFIG_PATH lets the theme be
// swapped entirely by pointing at a different file (a customer-specific
// theme, say configuration/themes/customer-a.yaml) with no code change and no
// rebuild of anything else in Ory_IDP — see
// docs/10-reference/neobim-plugin-architecture-proposal.md §3.
//
// Falls back to the hardcoded themes/neobim.ts default if the file is
// missing or fails to parse, rather than crashing the app over a config
// typo — this is a rendering concern, not an identity one, so it degrades
// gracefully.

import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { neobimTheme } from "./neobim";
import type { Theme } from "./types";

function resolveConfigPath(): string {
  return (
    process.env.THEME_CONFIG_PATH ??
    // identity-ui/ is one level under the repo root (not two, as it was
    // before the applications/neobim-identity-ui -> identity-ui/ move) —
    // this fallback only matters for local `npm run dev`, since every
    // Docker Compose service sets THEME_CONFIG_PATH explicitly.
    path.resolve(process.cwd(), "../configuration/themes/neobim.yaml")
  );
}

let cached: Theme | null = null;

export function loadTheme(): Theme {
  if (cached) return cached;

  const configPath = resolveConfigPath();
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw) as Theme;
    cached = parsed;
    return parsed;
  } catch (err) {
    console.warn(
      `[theme] could not load ${configPath}, falling back to the built-in theme: ${
        (err as Error).message
      }`,
    );
    cached = neobimTheme;
    return neobimTheme;
  }
}
