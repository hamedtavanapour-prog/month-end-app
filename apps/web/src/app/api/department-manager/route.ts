import { NextResponse } from "next/server";

import { normalizeWorkspace, getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  const context = await getAccessContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { department?: string; membershipId?: string | null } | null;
  if (!body?.department) return NextResponse.json({ error: "Invalid department" }, { status: 400 });
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("id, name, slug").eq("organization_id", context.organizationId).is("archived_at", null);
  const key = normalizeWorkspace(body.department);
  const department = (departments ?? []).find((item) => item.slug === key || normalizeWorkspace(item.name) === key);
  if (!department) return NextResponse.json({ error: "Department is not synced yet" }, { status: 404 });
  const { error } = await supabase.rpc("set_department_primary_manager", { p_department_id: department.id, p_membership_id: body.membershipId || null });
  return error ? NextResponse.json({ error: "Could not assign manager" }, { status: 403 }) : NextResponse.json({ saved: true });
}
