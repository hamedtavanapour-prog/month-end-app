import { NextResponse } from "next/server";

import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function POST(request: Request) {
  const context = await getAccessContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: string; departmentId?: string | null; entityType?: string; entityId?: string; details?: Json } | null;
  if (!body?.action || !body.entityType || !body.entityId) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_app_event", {
    p_organization_id: context.organizationId,
    p_department_id: body.departmentId || null,
    p_action: body.action,
    p_entity_type: body.entityType,
    p_entity_id: body.entityId,
    p_after_data: body.details ?? null,
  });
  return error ? NextResponse.json({ error: "Could not record event" }, { status: 500 }) : NextResponse.json({ recorded: true });
}
