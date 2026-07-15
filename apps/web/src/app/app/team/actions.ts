"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
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

export async function createInvitation(formData: FormData) {
  const context = await requireAccessContext();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff");
  const departmentIds = values(formData, "departments");
  const permissionKeys = values(formData, "permissions");

  if (!displayName || !email || !email.includes("@") || !permissionKeys.length) {
    redirect("/app/team?error=invalid_invitation");
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

  if (error) redirect(`/app/team?error=${invitationError(error.message)}`);
  revalidatePath("/app/team");
  redirect(`/app/team?created=${encodeURIComponent(displayName)}&token=${encodeURIComponent(token)}`);
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

  if (error) redirect("/app/team?error=update_failed");
  revalidatePath("/app/team");
  redirect("/app/team?updated=1");
}

export async function revokeInvitation(formData: FormData) {
  await requireAccessContext();
  const invitationId = String(formData.get("invitationId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_team_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) redirect("/app/team?error=revoke_failed");
  revalidatePath("/app/team");
  redirect("/app/team?revoked=1");
}

