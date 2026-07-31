"use server";

import { revalidatePath } from "next/cache";

import { createRelationTuple, deleteRelationTuple } from "@/adapters/console-api";

function relationFromForm(formData: FormData): {
  object: string;
  relation: string;
  subjectId: string;
} | null {
  const object = formData.get("team_id");
  const relation = formData.get("relation");
  const subjectId = formData.get("subject_id");
  if (
    typeof object === "string" &&
    object &&
    typeof relation === "string" &&
    relation &&
    typeof subjectId === "string" &&
    subjectId
  ) {
    return { object, relation, subjectId };
  }
  return null;
}

export async function addGroupRelationAction(formData: FormData): Promise<void> {
  const relation = relationFromForm(formData);
  if (relation) {
    await createRelationTuple({ namespace: "Team", ...relation });
  }
  revalidatePath("/console/groups");
}

export async function removeGroupRelationAction(formData: FormData): Promise<void> {
  const relation = relationFromForm(formData);
  if (relation) {
    await deleteRelationTuple({ namespace: "Team", ...relation });
  }
  revalidatePath("/console/groups");
}

// Team.parent (ory/keto/namespaces/namespaces.ts) is a subject_set
// relation, not a plain subject_id — it references a whole Organization
// object, not a user. This is what makes a group inherit its parent
// organization's admins per namespaces.ts's `traverse` calls.
export async function setGroupParentAction(formData: FormData): Promise<void> {
  const teamId = formData.get("team_id");
  const organizationId = formData.get("organization_id");
  if (typeof teamId === "string" && teamId && typeof organizationId === "string" && organizationId) {
    await createRelationTuple({
      namespace: "Team",
      object: teamId,
      relation: "parent",
      subjectSet: { namespace: "Organization", object: organizationId, relation: "" },
    });
  }
  revalidatePath("/console/groups");
}

export async function removeGroupParentAction(formData: FormData): Promise<void> {
  const teamId = formData.get("team_id");
  const organizationId = formData.get("organization_id");
  if (typeof teamId === "string" && teamId && typeof organizationId === "string" && organizationId) {
    await deleteRelationTuple({
      namespace: "Team",
      object: teamId,
      relation: "parent",
      subjectSet: { namespace: "Organization", object: organizationId, relation: "" },
    });
  }
  revalidatePath("/console/groups");
}
