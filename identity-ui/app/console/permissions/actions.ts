"use server";

import { revalidatePath } from "next/cache";

import { createRelationTuple, deleteRelationTuple } from "@/adapters/console-api";

function tupleFromForm(formData: FormData): {
  namespace: string;
  object: string;
  relation: string;
  subjectId: string;
} | null {
  const namespace = formData.get("namespace");
  const object = formData.get("object");
  const relation = formData.get("relation");
  const subjectId = formData.get("subject_id");
  if (
    typeof namespace === "string" &&
    namespace &&
    typeof object === "string" &&
    object &&
    typeof relation === "string" &&
    relation &&
    typeof subjectId === "string" &&
    subjectId
  ) {
    return { namespace, object, relation, subjectId };
  }
  return null;
}

export async function createRelationTupleAction(formData: FormData): Promise<void> {
  const tuple = tupleFromForm(formData);
  if (tuple) {
    await createRelationTuple(tuple);
  }
  revalidatePath("/console/permissions");
}

export async function deleteRelationTupleAction(formData: FormData): Promise<void> {
  const tuple = tupleFromForm(formData);
  if (tuple) {
    await deleteRelationTuple(tuple);
  }
  revalidatePath("/console/permissions");
}
