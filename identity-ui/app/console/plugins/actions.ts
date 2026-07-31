"use server";

import { revalidatePath } from "next/cache";

import {
  createPlugin,
  deletePlugin,
  rollbackPlugin,
  setPluginEnabled,
} from "@/adapters/plugin-service";

export async function createPluginAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const name = formData.get("name");
  const type = formData.get("type");
  const dependencies = formData.get("dependencies");
  const description = formData.get("description");
  const documentationUrl = formData.get("documentation_url");
  if (
    typeof id === "string" &&
    id &&
    typeof name === "string" &&
    name &&
    typeof type === "string" &&
    type
  ) {
    await createPlugin({
      dependencies:
        typeof dependencies === "string"
          ? dependencies.split(",").map((d) => d.trim()).filter(Boolean)
          : [],
      description: typeof description === "string" ? description : "",
      documentation_url: typeof documentationUrl === "string" ? documentationUrl : "",
      id,
      name,
      type,
    });
  }
  revalidatePath("/console/plugins");
}

export async function rollbackPluginAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const versionId = formData.get("version_id");
  if (typeof id === "string" && id && typeof versionId === "string" && versionId) {
    await rollbackPlugin(id, versionId);
  }
  revalidatePath("/console/plugins");
}

export async function setPluginEnabledAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const enabled = formData.get("enabled") === "true";
  if (typeof id === "string" && id) {
    await setPluginEnabled(id, enabled);
  }
  revalidatePath("/console/plugins");
}

export async function deletePluginAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deletePlugin(id);
  }
  revalidatePath("/console/plugins");
}
