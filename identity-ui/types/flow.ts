// Thin aliases only — the actual Kratos flow shape (ui.nodes[], attributes,
// messages, etc.) comes straight from @ory/client-fetch's generated types
// (UiNode, UiNodeAttributes, LoginFlow, RegistrationFlow, ...). Deliberately
// not reinventing that shape here, matching the pattern confirmed in
// .reference/platform-ory-id-spike/apps/id/src/lib/kratos.ts.

import type {
  LoginFlow,
  RecoveryFlow,
  RegistrationFlow,
  SettingsFlow,
  VerificationFlow,
} from "@ory/client-fetch";

export type FlowKind =
  | "login"
  | "registration"
  | "recovery"
  | "verification"
  | "settings";

export type BrowserFlow =
  | LoginFlow
  | RegistrationFlow
  | RecoveryFlow
  | VerificationFlow
  | SettingsFlow;

export type FlowSearchParams = Record<string, string | undefined>;
