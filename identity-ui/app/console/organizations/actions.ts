"use server";

import { revalidatePath } from "next/cache";

import { createTenant, deleteTenant } from "@/adapters/tenant-service";

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const name = formData.get("name");
  const domain = formData.get("domain");
  if (typeof name === "string" && name) {
    await createTenant(name, typeof domain === "string" ? domain : undefined);
  }
  revalidatePath("/console/organizations");
}

export async function deleteOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  if (typeof organizationId === "string" && organizationId) {
    await deleteTenant(organizationId);
  }
  revalidatePath("/console/organizations");
}
