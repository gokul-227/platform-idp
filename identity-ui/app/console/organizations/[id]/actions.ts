"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createRelationTuple, deleteRelationTuple } from "@/adapters/console-api";
import {
  createInvitation,
  deleteTenant,
  renameTenant,
  revokeInvitation,
} from "@/adapters/tenant-service";

export async function addMemberDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const identityId = formData.get("identity_id");
  const role = formData.get("role");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof identityId === "string" && identityId &&
    typeof role === "string" && role
  ) {
    await createRelationTuple({
      namespace: "Organization", object: organizationId, relation: role, subjectId: identityId,
    });
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function removeMemberDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const identityId = formData.get("identity_id");
  const role = formData.get("role");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof identityId === "string" && identityId &&
    typeof role === "string" && role
  ) {
    await deleteRelationTuple({
      namespace: "Organization", object: organizationId, relation: role, subjectId: identityId,
    });
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function grantOrganizationPermissionAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const relation = formData.get("relation");
  const subjectId = formData.get("subject_id");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof relation === "string" && relation &&
    typeof subjectId === "string" && subjectId
  ) {
    await createRelationTuple({
      namespace: "Organization", object: organizationId, relation, subjectId,
    });
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function revokeOrganizationPermissionAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const relation = formData.get("relation");
  const subjectId = formData.get("subject_id");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof relation === "string" && relation &&
    typeof subjectId === "string" && subjectId
  ) {
    await deleteRelationTuple({
      namespace: "Organization", object: organizationId, relation, subjectId,
    });
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function renameOrganizationDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const name = formData.get("name");
  if (typeof organizationId === "string" && organizationId && typeof name === "string" && name) {
    await renameTenant(organizationId, name);
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function deleteOrganizationDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  if (typeof organizationId === "string" && organizationId) {
    await deleteTenant(organizationId);
  }
  revalidatePath("/console/organizations");
  redirect("/console/organizations");
}

export async function createInvitationDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const email = formData.get("email");
  const role = formData.get("role");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof email === "string" && email &&
    typeof role === "string" && role
  ) {
    await createInvitation(organizationId, email, role);
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function revokeInvitationDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const invitationId = formData.get("invitation_id");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof invitationId === "string" && invitationId
  ) {
    await revokeInvitation(organizationId, invitationId);
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}

export async function resendInvitationDetailAction(formData: FormData): Promise<void> {
  const organizationId = formData.get("organization_id");
  const invitationId = formData.get("invitation_id");
  const email = formData.get("email");
  const role = formData.get("role");
  if (
    typeof organizationId === "string" && organizationId &&
    typeof invitationId === "string" && invitationId &&
    typeof email === "string" && email &&
    typeof role === "string" && role
  ) {
    // Resend = revoke the stale invitation, issue a fresh one (new token,
    // new expiry, new email dispatch) — tenant-service has no separate
    // "resend" state, since a token can only be safely re-sent, not
    // re-generated in place, without invalidating what may already be in
    // the recipient's inbox.
    await revokeInvitation(organizationId, invitationId);
    await createInvitation(organizationId, email, role);
  }
  if (typeof organizationId === "string") revalidatePath(`/console/organizations/${organizationId}`);
}
