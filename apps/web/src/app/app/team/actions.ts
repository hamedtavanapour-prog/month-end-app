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

function teamUrl(formData: FormData, values: Record<string, string> = {}) {
  const params = new URLSearchParams(values);
  if (formData.get("embedded") === "1") params.set("embedded", "1");
  const query = params.toString();
  return `/app/team${query ? `?${query}` : ""}`;
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

  revalidatePath("/app/team");
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
  const loginUrl = `${getPublicAppUrl()}/login?workspace=${encodeURIComponent(context.organizationSlug)}&email=${encodeURIComponent(email)}&status=prepared`;
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
  revalidatePath("/app/team");
  redirect(teamUrl(formData, { prepared: displayName, delivery: data.emailDelivered ? "email" : "failed" }));
}

export async function updateTeamMember(formData: FormData) {
  await requireAccessContext();
  const membershipId = String(formData.get("membershipId") ?? "");
  const role = String(formData.get("role") ?? "staff");
  const status = String(formData.get("status") ?? "active");
  const departmentIds = values(formData, "departments");
  const permissionKeys = values(formData, "permissions");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_team_member", {
    p_membership_id: membershipId,
    p_role: role,
    p_status: status,
    p_department_ids: departmentIds,
    p_permission_keys: permissionKeys,
  });

  if (error) redirect(teamUrl(formData, { error: "update_failed" }));
  revalidatePath("/app/team");
  redirect(teamUrl(formData, { updated: "1" }));
}

export async function revokeInvitation(formData: FormData) {
  await requireAccessContext();
  const invitationId = String(formData.get("invitationId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_team_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) redirect(teamUrl(formData, { error: "revoke_failed" }));
  revalidatePath("/app/team");
  redirect(teamUrl(formData, { revoked: "1" }));
}
