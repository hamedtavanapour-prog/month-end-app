import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AccessContext = {
  userId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "manager" | "staff";
  displayName: string;
  email: string;
  departmentIds: string[];
  permissionKeys: string[];
};

export async function getAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, organization_id, role, organizations(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const [{ data: profile }, { data: departmentRows }, { data: permissionRows }] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
    supabase.from("membership_departments").select("department_id").eq("membership_id", membership.id),
    supabase.from("membership_permissions").select("permission_key, allowed").eq("membership_id", membership.id),
  ]);

  const organization = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;
  const claimEmail = typeof claimsData.claims.email === "string" ? claimsData.claims.email : "";

  return {
    userId,
    membershipId: membership.id,
    organizationId: membership.organization_id,
    organizationName: organization?.name ?? "Workspace",
    role: membership.role as AccessContext["role"],
    displayName: profile?.display_name || claimEmail.split("@")[0] || "Team member",
    email: profile?.email || claimEmail,
    departmentIds: departmentRows?.map((row) => row.department_id) ?? [],
    permissionKeys: permissionRows?.filter((row) => row.allowed).map((row) => row.permission_key) ?? [],
  };
}

export async function requireAccessContext() {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  return context;
}

export function can(context: AccessContext, permission: string) {
  return context.role === "owner"
    || context.role === "admin"
    || context.permissionKeys.includes(permission);
}

