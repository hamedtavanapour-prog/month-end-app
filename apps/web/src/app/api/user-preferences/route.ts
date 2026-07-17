import { NextResponse } from "next/server";

import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
const ALLOWED_KEYS = new Set(["theme", "sidebarCollapsed", "density", "defaultDepartmentId", "defaultPage"]);

export async function GET() {
  const context = await getAccessContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase.from("user_preferences").select("preferences").eq("organization_id", context.organizationId).eq("user_id", context.userId).maybeSingle();
  return NextResponse.json({ preferences: data?.preferences ?? {} }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const context = await getAccessContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incoming = await request.json().catch(() => null) as Record<string, Json> | null;
  if (!incoming || Array.isArray(incoming) || typeof incoming !== "object") return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  const patch = Object.fromEntries(Object.entries(incoming).filter(([key]) => ALLOWED_KEYS.has(key))) as Record<string, Json>;
  if (JSON.stringify(patch).length > 4096) return NextResponse.json({ error: "Preferences are too large" }, { status: 413 });
  const supabase = await createClient();
  const { data: current } = await supabase.from("user_preferences").select("preferences").eq("organization_id", context.organizationId).eq("user_id", context.userId).maybeSingle();
  const currentPreferences = current?.preferences && !Array.isArray(current.preferences) && typeof current.preferences === "object" ? current.preferences : {};
  const { error } = await supabase.from("user_preferences").upsert({
    organization_id: context.organizationId,
    user_id: context.userId,
    preferences: { ...currentPreferences, ...patch },
    updated_at: new Date().toISOString(),
  });
  return error ? NextResponse.json({ error: "Could not save preferences" }, { status: 500 }) : NextResponse.json({ saved: true });
}
