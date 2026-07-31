"use server";

import { revalidatePath } from "next/cache";

import { createRole, deleteRole } from "@/adapters/authorization-service";

export async function createRoleAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const name = formData.get("name");
  const target = formData.get("target");
  const description = formData.get("description");
  if (
    typeof id === "string" && id &&
    typeof name === "string" && name &&
    typeof target === "string" && target.includes(":")
  ) {
    const [namespace, relation] = target.split(":");
    await createRole({
      description: typeof description === "string" ? description : "",
      id,
      name,
      namespace,
      relation,
    });
  }
  revalidatePath("/console/roles");
}

export async function deleteRoleAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deleteRole(id);
  }
  revalidatePath("/console/roles");
}
