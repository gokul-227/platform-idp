"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { identityAdmin, listRelationTuples } from "@/adapters/admin";
import { deleteRelationTuple } from "@/adapters/console-api";
import { grantPlatformAdmin, revokePlatformAdmin } from "@/adapters/hooks-service";

const PLATFORM_ORGANIZATION_ID = "platform";
const PAGE_PATH = "/console/settings/administrators";

export async function promoteAdminAction(formData: FormData): Promise<void> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent("Enter an email address")}`);
  }

  const matches = await identityAdmin.listIdentities({
    pageSize: 5,
    previewCredentialsIdentifierSimilar: email.trim(),
  });
  const identity = matches.find(
    (i) => (i.traits as { email?: string })?.email?.toLowerCase() === email.trim().toLowerCase(),
  );
  if (!identity) {
    redirect(
      `${PAGE_PATH}?error=${encodeURIComponent(`No account found with email ${email.trim()} — they must register first`)}`,
    );
  }

  const result = await grantPlatformAdmin(identity.id);
  if (!result.ok) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent(result.error ?? "Failed to grant administrator access")}`);
  }
  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?promoted=${encodeURIComponent(email.trim())}`);
}

export async function revokeAdminAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId !== "string" || !identityId) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent("Missing identity")}`);
  }

  // Safety: never allow revoking the last remaining administrator — that
  // would lock everyone out of the console with no browser-only recovery
  // path (the same reason /admin/bootstrap only ever grants, never regrants
  // once an admin exists).
  const tuples = await listRelationTuples("Organization", PLATFORM_ORGANIZATION_ID);
  const adminCount = tuples.filter((t) => t.relation === "admin").length;
  if (adminCount <= 1) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent("Cannot revoke the last remaining administrator")}`);
  }

  const result = await revokePlatformAdmin(identityId);
  if (!result.ok) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent(result.error ?? "Failed to revoke administrator access")}`);
  }
  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?revoked=1`);
}

async function clearRequest(identityId: string): Promise<void> {
  await deleteRelationTuple({
    namespace: "Organization",
    object: PLATFORM_ORGANIZATION_ID,
    relation: "admin_requested",
    subjectId: identityId,
  });
}

export async function approveAdminRequestAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId !== "string" || !identityId) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent("Missing identity")}`);
  }

  const result = await grantPlatformAdmin(identityId);
  if (!result.ok) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent(result.error ?? "Failed to grant administrator access")}`);
  }
  await clearRequest(identityId);
  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?promoted=${encodeURIComponent(identityId)}`);
}

export async function denyAdminRequestAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identity_id");
  if (typeof identityId === "string" && identityId) {
    await clearRequest(identityId);
  }
  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?denied=1`);
}
