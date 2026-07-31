"use server";

import { revalidatePath } from "next/cache";

import { createPolicy, deletePolicy } from "@/adapters/authorization-service";

export async function createPolicyAction(formData: FormData): Promise<void> {
  const roleId = formData.get("role_id");
  const objectId = formData.get("object_id");
  const subjectId = formData.get("subject_id");
  if (
    typeof roleId === "string" && roleId &&
    typeof objectId === "string" && objectId &&
    typeof subjectId === "string" && subjectId
  ) {
    await createPolicy(roleId, objectId, subjectId);
  }
  revalidatePath("/console/policies");
}

export async function deletePolicyAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deletePolicy(id);
  }
  revalidatePath("/console/policies");
}
