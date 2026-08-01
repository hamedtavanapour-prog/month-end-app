import { NextResponse } from "next/server";

import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_PERMISSIONS: Record<string, string[]> = {
  dashboard: ["dashboard.view"],
  products: ["products.view"],
  menu: ["products.view"],
  "live-inventory": ["inventory.view"],
  inventory: ["counts.view"],
  orders: ["orders.view"],
  usage: ["usage.view"],
  insights: ["dashboard.view", "reports.view"],
  suppliers: ["suppliers.view"],
  reports: ["reports.view"],
  settings: ["settings.rooms", "settings.departments", "settings.users", "settings.permissions"],
};

export async function GET() {
  const context = await getAccessContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const [{ data: departments }, { data: preferences }, { data: managerMemberships }, { data: profiles }] = await Promise.all([
    context.departmentIds.length ? supabase.from("departments").select("id, name").in("id", context.departmentIds) : Promise.resolve({ data: [] }),
    supabase.from("user_preferences").select("preferences").eq("organization_id", context.organizationId).eq("user_id", context.userId).maybeSingle(),
    supabase.from("memberships").select("id, user_id, role, job_title, status").eq("organization_id", context.organizationId).eq("status", "active").in("role", ["owner", "admin", "manager"]),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const fullAccess = context.role === "owner" || context.role === "admin";
  const pages = Object.fromEntries(Object.entries(PAGE_PERMISSIONS).map(([page, permissions]) => [
    page,
    fullAccess || permissions.some((permission) => context.permissionKeys.includes(permission)),
  ]));

  return NextResponse.json({
    user: {
      id: context.userId,
      name: context.displayName,
      email: context.email,
      role: context.role,
      jobTitle: context.jobTitle,
    },
    organization: { id: context.organizationId, name: context.organizationName },
    departments: fullAccess ? "all" : departments ?? [],
    permissions: fullAccess ? "all" : context.permissionKeys,
    pages,
    canManageUsers: fullAccess || context.role === "manager" || context.permissionKeys.includes("settings.users"),
    preferences: preferences?.preferences ?? {},
    managers: (managerMemberships ?? []).map((membership) => {
      const profile = (profiles ?? []).find((item) => item.id === membership.user_id);
      return { id: membership.id, userId: membership.user_id, name: profile?.display_name || profile?.email || "Manager", email: profile?.email || "", role: membership.job_title || membership.role };
    }),
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
