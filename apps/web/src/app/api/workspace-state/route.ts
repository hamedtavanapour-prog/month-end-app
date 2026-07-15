import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 10 * 1024 * 1024;

type MembershipContext = {
  membershipId: string;
  organizationId: string;
  permissionKeys: string[];
  role: string;
  userId: string;
};

const READ_PERMISSIONS = new Set([
  "dashboard.view", "products.view", "inventory.view", "counts.view", "orders.view",
  "usage.view", "suppliers.view", "reports.view",
]);
const WRITE_PERMISSIONS = new Set([
  "products.manage", "inventory.manage", "counts.create", "counts.finish", "orders.manage",
  "usage.upload", "usage.manage", "suppliers.manage", "settings.rooms",
]);

function isAllowed(context: MembershipContext, permissions: Set<string>) {
  return context.role === "owner"
    || context.role === "admin"
    || context.permissionKeys.some((permission) => permissions.has(permission));
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function getMembershipContext(): Promise<
  | { context: MembershipContext; supabase: Awaited<ReturnType<typeof createClient>> }
  | { error: NextResponse }
> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) return { error: jsonResponse({ error: "Unauthorized" }, 401) };

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("id, organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    return { error: jsonResponse({ error: "No active workspace" }, 403) };
  }

  const { data: permissionRows } = await supabase
    .from("membership_permissions")
    .select("permission_key, allowed")
    .eq("membership_id", membership.id);

  return {
    context: {
      membershipId: membership.id,
      organizationId: membership.organization_id,
      permissionKeys: permissionRows?.filter((row) => row.allowed).map((row) => row.permission_key) ?? [],
      role: membership.role,
      userId,
    },
    supabase,
  };
}

async function importLegacyState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: MembershipContext,
) {
  if (context.role !== "owner") return null;

  const legacyUrl = process.env.LEGACY_STATE_URL;
  const legacyKey = process.env.LEGACY_STATE_ANON_KEY;
  if (!legacyUrl || !legacyKey) return null;

  const response = await fetch(legacyUrl, {
    headers: { apikey: legacyKey, Authorization: `Bearer ${legacyKey}` },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const rows = await response.json() as Array<{ data?: Json }>;
  const data = rows[0]?.data;
  if (!data || Array.isArray(data) || typeof data !== "object") return null;

  const { error } = await supabase.from("workspace_states").upsert({
    organization_id: context.organizationId,
    data,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  });

  return error ? null : data;
}

export async function GET() {
  const result = await getMembershipContext();
  if ("error" in result) return result.error;

  const { context, supabase } = result;
  if (!isAllowed(context, READ_PERMISSIONS)) {
    return jsonResponse({ error: "Workspace access is not assigned" }, 403);
  }
  const { data: workspaceState, error } = await supabase
    .from("workspace_states")
    .select("data, updated_at")
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (error) return jsonResponse({ error: "Could not load workspace" }, 500);

  if (!workspaceState) {
    const importedData = await importLegacyState(supabase, context);
    return jsonResponse({ data: importedData, imported: Boolean(importedData) });
  }

  return jsonResponse({ data: workspaceState.data, updatedAt: workspaceState.updated_at });
}

export async function PUT(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_STATE_BYTES) {
    return jsonResponse({ error: "Workspace state is too large" }, 413);
  }

  const result = await getMembershipContext();
  if ("error" in result) return result.error;

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_STATE_BYTES) {
    return jsonResponse({ error: "Workspace state is too large" }, 413);
  }

  let data: Json;
  try {
    data = JSON.parse(rawBody) as Json;
  } catch {
    return jsonResponse({ error: "Invalid workspace state" }, 400);
  }

  if (!data || Array.isArray(data) || typeof data !== "object") {
    return jsonResponse({ error: "Workspace state must be an object" }, 400);
  }

  const { context, supabase } = result;
  if (!isAllowed(context, WRITE_PERMISSIONS)) {
    return jsonResponse({ error: "You do not have permission to change this workspace" }, 403);
  }
  const { error } = await supabase.from("workspace_states").upsert({
    organization_id: context.organizationId,
    data,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) return jsonResponse({ error: "Could not save workspace" }, 500);
  await supabase.rpc("record_workspace_save", { p_organization_id: context.organizationId });
  return jsonResponse({ saved: true });
}
