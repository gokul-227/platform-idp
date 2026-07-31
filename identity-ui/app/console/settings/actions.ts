"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyConfigurationBundle,
  validateConfigurationBundleShape,
  type ConfigurationBundle,
} from "@/adapters/config-bundle";

export async function importConfigurationBundleAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("bundle") ?? "");
  const validateOnly = formData.get("validate_only") === "on";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect("/console/settings?import_error=Invalid+JSON");
  }

  const shapeErrors = validateConfigurationBundleShape(parsed);
  if (shapeErrors.length > 0) {
    redirect(`/console/settings?import_error=${encodeURIComponent(shapeErrors.join("; "))}`);
  }

  if (validateOnly) {
    redirect("/console/settings?import_validated=true");
  }

  const results = await applyConfigurationBundle(parsed as ConfigurationBundle);
  const failed = results.filter((r) => !r.ok);
  revalidatePath("/console/settings");
  if (failed.length > 0) {
    redirect(
      `/console/settings?import_partial=${results.length - failed.length}/${results.length}`,
    );
  }
  redirect(`/console/settings?import_success=${results.length}`);
}
