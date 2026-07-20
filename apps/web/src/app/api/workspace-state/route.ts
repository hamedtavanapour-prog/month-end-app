import { NextResponse } from "next/server";

import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createCountDraftInWorkspace, isCountJsonObject, saveCountRoomInWorkspace } from "@/lib/workspace/count-state";
import { renameCategoryInWorkspace } from "@/lib/workspace/category-state";
import { isJsonObject, mergeProductIntoWorkspace } from "@/lib/workspace/product-state";
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
  const access = await getAccessContext();
  if (!access) {
    return { error: jsonResponse({ error: "No active workspace" }, 403) };
  }

  return {
    context: {
      membershipId: access.membershipId,
      organizationId: access.organizationId,
      permissionKeys: access.permissionKeys,
      role: access.role,
      userId: access.userId,
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

export async function GET(request: Request) {
  const result = await getMembershipContext();
  if ("error" in result) return result.error;

  const { context, supabase } = result;
  if (!isAllowed(context, READ_PERMISSIONS)) {
    return jsonResponse({ error: "Workspace access is not assigned" }, 403);
  }
  const expectedVersion = request.headers.get("x-workspace-version");
  if (expectedVersion) {
    const { data: version, error: versionError } = await supabase
      .from("workspace_states")
      .select("updated_at")
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (versionError) return jsonResponse({ error: "Could not load workspace" }, 500);
    if (version?.updated_at === expectedVersion) {
      return new NextResponse(null, {
        status: 304,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }
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
  const updatedAt = new Date().toISOString();
  const expectedVersion = request.headers.get("x-workspace-version");
  const mutation = expectedVersion
    ? supabase.from("workspace_states")
      .update({ data, updated_by: context.userId, updated_at: updatedAt })
      .eq("organization_id", context.organizationId)
      .eq("updated_at", expectedVersion)
    : supabase.from("workspace_states").upsert({
      organization_id: context.organizationId,
      data,
      updated_by: context.userId,
      updated_at: updatedAt,
    });
  const { data: saved, error } = await mutation.select("updated_at").maybeSingle();

  if (error) return jsonResponse({ error: "Could not save workspace" }, 500);
  if (!saved) return jsonResponse({ error: "The workspace changed in another account. Refresh before saving again." }, 409);
  await supabase.rpc("record_workspace_save", { p_organization_id: context.organizationId });
  return jsonResponse({ saved: true, updatedAt: saved.updated_at });
}

export async function PATCH(request: Request) {
  const result = await getMembershipContext();
  if ("error" in result) return result.error;

  const { context, supabase } = result;
  let body: Json;
  try {
    body = await request.json() as Json;
  } catch {
    return jsonResponse({ error: "Invalid workspace update" }, 400);
  }
  if (!isJsonObject(body)) return jsonResponse({ error: "A workspace update is required" }, 400);

  const categoryRename = isJsonObject(body.categoryRename) ? body.categoryRename : null;
  const countDraft = isJsonObject(body.countDraft) ? body.countDraft : null;
  const countRoomSave = isJsonObject(body.countRoomSave) ? body.countRoomSave : null;
  const product = isJsonObject(body.product) ? body.product : null;
  if (!categoryRename && !countDraft && !countRoomSave && !product) {
    return jsonResponse({ error: "A supported workspace update is required" }, 400);
  }
  const requiredPermission = countDraft || countRoomSave ? "counts.create" : "products.manage";
  if (!isAllowed(context, new Set([requiredPermission]))) {
    return jsonResponse({ error: "You do not have permission to make this change" }, 403);
  }

  let buildNextData: (data: Json) => Json;
  let entityLabel: string;
  if (categoryRename) {
    const previousName = typeof categoryRename.previousName === "string" ? categoryRename.previousName.trim() : "";
    const name = typeof categoryRename.name === "string" ? categoryRename.name.trim() : "";
    const subcategories = Array.isArray(categoryRename.subcategories)
      ? categoryRename.subcategories
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
      : [];
    if (!name || name.length > 60 || subcategories.some((value) => value.length > 80)) {
      return jsonResponse({ error: "Valid category names are required" }, 400);
    }
    const uniqueSubcategories = [...new Set(subcategories)];
    buildNextData = (data) => renameCategoryInWorkspace(data, previousName, name, uniqueSubcategories);
    entityLabel = "category";
  } else if (countDraft) {
    const id = typeof countDraft.id === "string" ? countDraft.id.trim() : "";
    const date = typeof countDraft.date === "string" ? countDraft.date.trim() : "";
    const label = typeof countDraft.label === "string" ? countDraft.label.trim() : "";
    const rooms = Array.isArray(countDraft.rooms) ? countDraft.rooms.filter(isCountJsonObject) : [];
    if (!id || id.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !label || label.length > 120 || !rooms.length) {
      return jsonResponse({ error: "Valid count details and rooms are required" }, 400);
    }
    const safeRooms = rooms.map((room) => ({
      id: typeof room.id === "string" ? room.id.slice(0, 100) : "",
      roomId: typeof room.roomId === "string" ? room.roomId.slice(0, 100) : "",
      name: typeof room.name === "string" ? room.name.slice(0, 120) : "Room",
      items: {},
      extraProductIds: [],
    })).filter((room) => room.id && room.roomId);
    if (!safeRooms.length) return jsonResponse({ error: "At least one valid room is required" }, 400);
    const actor = {
      id: context.userId,
      name: typeof countDraft.createdBy === "object" && countDraft.createdBy && !Array.isArray(countDraft.createdBy)
        && typeof countDraft.createdBy.name === "string" ? countDraft.createdBy.name.slice(0, 160) : "Team member",
      role: typeof countDraft.createdBy === "object" && countDraft.createdBy && !Array.isArray(countDraft.createdBy)
        && typeof countDraft.createdBy.role === "string" ? countDraft.createdBy.role.slice(0, 80) : "Team member",
    };
    const safeDraft = { id, date, label, items: {}, rooms: safeRooms, draft: true, createdBy: actor, createdAt: new Date().toISOString() };
    buildNextData = (data) => createCountDraftInWorkspace(data, safeDraft);
    entityLabel = "count draft";
  } else if (countRoomSave) {
    const countId = typeof countRoomSave.countId === "string" ? countRoomSave.countId.trim() : "";
    const roomId = typeof countRoomSave.roomId === "string" ? countRoomSave.roomId.trim() : "";
    const items = isCountJsonObject(countRoomSave.items) ? countRoomSave.items : null;
    const extraProductIds = Array.isArray(countRoomSave.extraProductIds)
      ? countRoomSave.extraProductIds.filter((value): value is string => typeof value === "string").map((value) => value.trim())
      : [];
    if (!countId || countId.length > 100 || !roomId || roomId.length > 100 || !items
      || extraProductIds.length > 100 || extraProductIds.some((productId) => !productId || productId.length > 100)) {
      return jsonResponse({ error: "Valid count room details are required" }, 400);
    }
    const safeItems: { [key: string]: Json | undefined } = {};
    for (const [productId, quantity] of Object.entries(items)) {
      if (!productId || productId.length > 100 || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) {
        return jsonResponse({ error: "Count quantities must be valid non-negative numbers" }, 400);
      }
      safeItems[productId] = quantity;
    }
    const { data: ownedLock, error: lockError } = await supabase
      .from("count_room_locks")
      .select("room_id")
      .eq("organization_id", context.organizationId)
      .eq("count_id", countId)
      .eq("room_id", roomId)
      .eq("user_id", context.userId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (lockError) return jsonResponse({ error: "Could not verify the room reservation" }, 500);
    if (!ownedLock) return jsonResponse({ error: "This room is no longer reserved for you" }, 409);
    const actor = { userId: context.userId };
    buildNextData = (data) => saveCountRoomInWorkspace(data, countId, roomId, safeItems, [...new Set(extraProductIds)], actor);
    entityLabel = "count room";
  } else {
    if (!product || typeof product.id !== "string" || !product.id || typeof product.name !== "string" || !product.name.trim()) {
      return jsonResponse({ error: "Product ID and name are required" }, 400);
    }
    const productCatalogVersion = typeof body.productCatalogVersion === "string" && body.productCatalogVersion.length <= 64
      ? body.productCatalogVersion
      : undefined;
    buildNextData = (data) => mergeProductIntoWorkspace(data, product, productCatalogVersion);
    entityLabel = "product";
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: current, error: readError } = await supabase
      .from("workspace_states")
      .select("data, updated_at")
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (readError) return jsonResponse({ error: "Could not load the shared workspace" }, 500);
    if (!current) return jsonResponse({ error: "Shared workspace is not initialized" }, 409);

    let nextData: Json;
    try {
      nextData = buildNextData(current.data);
    } catch (error) {
      if (error instanceof Error && error.message === "count_room_not_found") {
        return jsonResponse({ error: "That count room no longer exists" }, 404);
      }
      throw error;
    }
    const currentTimestamp = new Date(current.updated_at).getTime();
    const nextUpdatedAt = new Date(Math.max(Date.now(), currentTimestamp + 1)).toISOString();
    const { data: saved, error: saveError } = await supabase
      .from("workspace_states")
      .update({ data: nextData, updated_by: context.userId, updated_at: nextUpdatedAt })
      .eq("organization_id", context.organizationId)
      .eq("updated_at", current.updated_at)
      .select("data, updated_at")
      .maybeSingle();
    if (saveError) return jsonResponse({ error: `Could not save the shared ${entityLabel}` }, 500);
    if (!saved) continue;

    await supabase.rpc("record_workspace_save", { p_organization_id: context.organizationId });
    return jsonResponse({ saved: true, data: saved.data, updatedAt: saved.updated_at });
  }

  return jsonResponse({ error: `The workspace changed while this ${entityLabel} was saving. Try again.` }, 409);
}
