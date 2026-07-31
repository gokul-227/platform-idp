"use server";

import { revalidatePath } from "next/cache";

import { createRelationTuple, deleteRelationTuple } from "@/adapters/console-api";
import { getSession, revokeAllMyOtherSessions, revokeSession } from "@/adapters/kratos-flow";

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await revokeSession(id);
  }
  revalidatePath("/settings");
}

export async function revokeAllMyOtherSessionsAction(): Promise<void> {
  await revokeAllMyOtherSessions();
  revalidatePath("/settings");
}

const PLATFORM_ORGANIZATION_ID = "platform";

// Records a real Keto tuple (Organization:platform#admin_requested@<you>) —
// not a fabricated request queue. An existing admin approves it from
// /console/settings/administrators, which turns this into the real `admin`
// relation the same way direct promotion always has. The subject is always
// the caller's own session identity — never taken from form input — so
// this endpoint can't be used to request access on someone else's behalf.
export async function requestAdminAccessAction(): Promise<void> {
  const session = await getSession();
  if (session?.identity?.id) {
    await createRelationTuple({
      namespace: "Organization",
      object: PLATFORM_ORGANIZATION_ID,
      relation: "admin_requested",
      subjectId: session.identity.id,
    });
  }
  revalidatePath("/settings");
}

export async function cancelAdminRequestAction(): Promise<void> {
  const session = await getSession();
  if (session?.identity?.id) {
    await deleteRelationTuple({
      namespace: "Organization",
      object: PLATFORM_ORGANIZATION_ID,
      relation: "admin_requested",
      subjectId: session.identity.id,
    });
  }
  revalidatePath("/settings");
}
