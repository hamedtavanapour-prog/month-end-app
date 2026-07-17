import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type AccessContext = {
  userId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: "owner" | "admin" | "manager" | "staff";
  jobTitle: string;
  mustChangePassword: boolean;
  displayName: string;
  email: string;
  departmentIds: string[];
  permissionKeys: string[];
};

export const WORKSPACE_COOKIE = "me_workspace";

export function normalizeWorkspace(value: string) {
  return value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function workspaceMatches(identifier: string, organization: { name: string; slug: string }) {
  const wanted = normalizeWorkspace(identifier);
  const name = normalizeWorkspace(organization.name);
  const slug = normalizeWorkspace(organization.slug);
  if (!wanted) return false;
  if (wanted === name || wanted === slug) return true;
  const wantedWords = wanted.split("-").filter((word) => word.length > 2 && !["the", "restaurant"].includes(word));
  const organizationWords = new Set(`${name}-${slug}`.split("-"));
  return wantedWords.length > 0 && wantedWords.every((word) => organizationWords.has(word));
}

export async function getAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const cookieStore = await cookies();
  const selectedWorkspace = cookieStore.get(WORKSPACE_COOKIE)?.value ?? "";
  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, organization_id, role, job_title, must_change_password, organizations(name, slug)")
    .eq("user_id", userId)
    .eq("status", "active");

  const candidates = (memberships ?? []).map((membership) => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;
    return { membership, organization };
  }).filter((item) => item.organization);
  const selected = selectedWorkspace
    ? candidates.find((item) => workspaceMatches(selectedWorkspace, item.organization!))
    : candidates.length === 1 ? candidates[0] : null;
  const membership = selected?.membership;

  if (!membership) return null;

  const [{ data: profile }, { data: departmentRows }, { data: permissionRows }] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
    supabase.from("membership_departments").select("department_id").eq("membership_id", membership.id),
    supabase.from("membership_permissions").select("permission_key, allowed").eq("membership_id", membership.id),
  ]);

  const organization = selected?.organization;
  const claimEmail = typeof claimsData.claims.email === "string" ? claimsData.claims.email : "";

  return {
    userId,
    membershipId: membership.id,
    organizationId: membership.organization_id,
    organizationName: organization?.name ?? "Workspace",
    organizationSlug: organization?.slug ?? "workspace",
    role: membership.role as AccessContext["role"],
    jobTitle: membership.job_title || membership.role,
    mustChangePassword: membership.must_change_password,
    displayName: profile?.display_name || claimEmail.split("@")[0] || "Team member",
    email: profile?.email || claimEmail,
    departmentIds: departmentRows?.map((row) => row.department_id) ?? [],
    permissionKeys: permissionRows?.filter((row) => row.allowed).map((row) => row.permission_key) ?? [],
  };
}

export async function requireAccessContext(options: { allowPasswordChange?: boolean } = {}) {
  const context = await getAccessContext();
  if (!context) redirect("/login");
  if (context.mustChangePassword && !options.allowPasswordChange) redirect("/change-password");
  return context;
}

export function can(context: AccessContext, permission: string) {
  return context.role === "owner"
    || context.role === "admin"
    || context.permissionKeys.includes(permission);
}
