"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
import { sendInvitationSetupEmail } from "@/lib/auth/invitation-email";
import { getPublicAppUrl } from "@/lib/auth/public-url";
import { createClient } from "@/lib/supabase/server";

function values(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

function invitationError(message?: string) {
  if (message?.includes("already_a_member")) return "already_member";
  if (message?.includes("only_owner")) return "owner_required";
  if (message?.includes("manager")) return "manager_scope";
  return "invite_failed";
}

function positionError(message?: string) {
  if (message?.includes("already_exists")) return "position_exists";
  if (message?.includes("ceiling")) return "permission_ceiling";
  if (message?.includes("scope") || message?.includes("denied")) return "position_scope";
  return "position_failed";
}

function teamUrl(formData: FormData, values: Record<string, string> = {}) {
  const params = new URLSearchParams(values);
  if (formData.get("embedded") === "1") params.set("embedded", "1");
  const query = params.toString();
  return `/app/people${query ? `?${query}` : ""}`;
}

export async function createInvitation(formData: FormData) {
  const context = await requireAccessContext();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff");
  const departmentIds = values(formData, "departments");
  const permissionKeys = values(formData, "permissions");

  if (!displayName || !email || !email.includes("@") || !permissionKeys.length) {
    redirect(teamUrl(formData, { error: "invalid_invitation" }));
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_team_invitation", {
    p_organization_id: context.organizationId,
    p_email: email,
    p_display_name: displayName,
    p_role: role,
    p_token_hash: tokenHash,
    p_department_ids: departmentIds,
    p_permission_keys: permissionKeys,
    p_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) redirect(teamUrl(formData, { error: invitationError(error.message) }));

  const { error: emailError } = await sendInvitationSetupEmail({
    displayName,
    email,
    token,
  });

  revalidatePath("/app/people");
  redirect(teamUrl(formData, { created: displayName, token, delivery: emailError ? "failed" : "email" }));
}

export async function createPreparedAccount(formData: FormData) {
  const context = await requireAccessContext();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const temporaryPassword = String(formData.get("temporaryPassword") ?? "");
  const role = String(formData.get("role") ?? "staff");
  const jobTitle = String(formData.get("jobTitle") ?? "Team Member").trim();
  const departmentIds = values(formData, "departments");
  const permissionKeys = values(formData, "permissions");
  if (!displayName || !email.includes("@") || temporaryPassword.length < 12 || !jobTitle || !permissionKeys.length) {
    redirect(teamUrl(formData, { error: "invalid_prepared_account" }));
  }

  const supabase = await createClient();
  const loginUrl = `${getPublicAppUrl()}/login?email=${encodeURIComponent(email)}&status=prepared`;
  const { data, error } = await supabase.functions.invoke("create-prepared-user", { body: {
    organizationId: context.organizationId,
    email,
    displayName,
    temporaryPassword,
    role,
    jobTitle,
    departmentIds,
    permissionKeys,
    loginUrl,
  } });
  if (error || !data?.created) {
    const code = data?.error === "account_exists" ? "account_exists" : invitationError(data?.error || error?.message);
    redirect(teamUrl(formData, { error: code }));
  }
  revalidatePath("/app/people");
  redirect(teamUrl(formData, { prepared: displayName, delivery: data.emailDelivered ? "email" : "failed" }));
}

export async function updateTeamMember(formData: FormData) {
  await requireAccessContext();
  const membershipId = String(formData.get("membershipId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const role = String(formData.get("role") ?? "staff");
  const status = String(formData.get("status") ?? "active");
  const departmentIds = values(formData, "departments");
  const permissionKeys = values(formData, "permissions");
  const locationIds = values(formData, "locations");
  const positionIds = values(formData, "positions");
  const primaryLocationId = String(formData.get("primaryLocation") ?? "") || null;
  const primaryPositionId = String(formData.get("primaryPosition") ?? "") || null;
  const primaryDepartmentId = String(formData.get("primaryDepartment") ?? "") || null;
  const supervisorMembershipId = String(formData.get("supervisorMembership") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_team_member_profile", {
    p_membership_id: membershipId,
    p_display_name: displayName,
    p_job_title: jobTitle,
    p_role: role,
    p_status: status,
    p_department_ids: departmentIds,
    p_permission_keys: permissionKeys,
  });

  if (error) redirect(teamUrl(formData, { error: "update_failed" }));
  const { error: structureError } = await supabase.rpc("set_member_structure", {
    p_membership_id: membershipId,
    p_location_ids: locationIds,
    p_primary_location_id: primaryLocationId,
    p_position_ids: positionIds,
    p_primary_position_id: primaryPositionId,
    p_department_ids: departmentIds,
    p_primary_department_id: primaryDepartmentId,
    p_supervisor_membership_id: supervisorMembershipId,
  });
  if (structureError) redirect(teamUrl(formData, { error: "update_failed" }));
  revalidatePath("/app/people");
  redirect(teamUrl(formData, { updated: "1" }));
}

export async function createPosition(formData: FormData) {
  const context = await requireAccessContext();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "") || null;
  const departmentIds = values(formData, "departments");
  const primaryDepartmentId = String(formData.get("primaryDepartment") ?? "") || null;
  const permissionKeys = values(formData, "permissions");
  if (!name || !locationId || !permissionKeys.length) {
    redirect(teamUrl(formData, { error: "invalid_position" }));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_position", {
    p_organization_id: context.organizationId,
    p_name: name,
    p_description: description,
    p_region_id: null,
    p_location_id: locationId,
    p_can_manage_people: formData.get("canManagePeople") === "on",
    p_department_ids: departmentIds,
    p_primary_department_id: primaryDepartmentId,
    p_permission_keys: permissionKeys,
  });
  if (error) redirect(teamUrl(formData, { error: positionError(error.message) }));
  revalidatePath("/app/people");
  redirect(teamUrl(formData, { position_created: "1" }));
}

export async function revokeInvitation(formData: FormData) {
  await requireAccessContext();
  const invitationId = String(formData.get("invitationId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_team_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) redirect(teamUrl(formData, { error: "revoke_failed" }));
  revalidatePath("/app/people");
  redirect(teamUrl(formData, { revoked: "1" }));
}
