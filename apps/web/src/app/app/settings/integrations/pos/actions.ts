"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { can, requireAccessContext } from "@/lib/auth/context";
import { createPosProvider } from "@/lib/pos/provider";
import { ensureMockConnection, importPosMenu, syncPosTickets, type PosConnection } from "@/lib/pos/sync";
import { extractWorkspaceCatalog } from "@/lib/pos/workspace-catalog";
import { createClient } from "@/lib/supabase/server";

const PAGE_PATH = "/app/settings/integrations/pos";

function pageUrl(values: Record<string, string>) {
  return `${PAGE_PATH}?${new URLSearchParams(values).toString()}`;
}

async function requirePermission(permission: string) {
  const context = await requireAccessContext();
  if (!can(context, permission)) redirect("/app/forbidden?from=/app/settings/integrations/pos");
  return context;
}

async function loadConnection(): Promise<{ context: Awaited<ReturnType<typeof requireAccessContext>>; supabase: Awaited<ReturnType<typeof createClient>>; connection: PosConnection }> {
  const context = await requirePermission("integrations.pos.sync");
  const supabase = await createClient();
  const { data: integration, error } = await supabase.from("pos_integrations").select("*")
    .eq("organization_id", context.organizationId)
    .eq("provider", "omnivore")
    .eq("mode", "mock")
    .maybeSingle();
  if (error || !integration) redirect(pageUrl({ error: "mock_connection_required" }));
  const { data: location, error: locationError } = await supabase.from("pos_locations").select("*")
    .eq("organization_id", context.organizationId)
    .eq("integration_id", integration.id)
    .maybeSingle();
  if (locationError || !location) redirect(pageUrl({ error: "mock_connection_required" }));
  return { context, supabase, connection: { integration, location } };
}

async function recordEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, string | number | boolean | null>,
) {
  await supabase.rpc("record_app_event", {
    p_organization_id: organizationId,
    p_department_id: null,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_after_data: details,
  });
}

export async function enableMockConnection() {
  const context = await requirePermission("integrations.pos.manage");
  const supabase = await createClient();
  const adapter = createPosProvider("omnivore", "mock");
  try {
    const connection = await ensureMockConnection(supabase, context, adapter);
    await recordEvent(supabase, context.organizationId, "integration.configured", "pos_integration", connection.integration.id, { provider: "omnivore", mode: "mock" });
  } catch (error) {
    redirect(pageUrl({ error: "connection_failed", detail: error instanceof Error ? error.message : "Unknown error" }));
  }
  revalidatePath(PAGE_PATH);
  redirect(pageUrl({ success: "mock_connected" }));
}

export async function disconnectMockConnection() {
  const context = await requirePermission("integrations.pos.manage");
  const supabase = await createClient();
  const { data: integration } = await supabase.from("pos_integrations").select("id")
    .eq("organization_id", context.organizationId).eq("provider", "omnivore").maybeSingle();
  if (integration) {
    await supabase.from("pos_integrations").update({ status: "disconnected", updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", integration.id);
    await recordEvent(supabase, context.organizationId, "integration.disconnected", "pos_integration", integration.id, { provider: "omnivore", mode: "mock" });
  }
  revalidatePath(PAGE_PATH);
  redirect(pageUrl({ success: "disconnected" }));
}

export async function importMockMenu() {
  const { context, supabase, connection } = await loadConnection();
  let received = 0;
  try {
    const result = await importPosMenu(supabase, context, connection, createPosProvider("omnivore", "mock"));
    received = result.received;
    await recordEvent(supabase, context.organizationId, "integration.menu_imported", "pos_integration", connection.integration.id, result);
  } catch (error) {
    await recordEvent(supabase, context.organizationId, "integration.sync_failed", "pos_integration", connection.integration.id, { provider: "omnivore", sync_kind: "menu", error: error instanceof Error ? error.message : "Unknown error" });
    redirect(pageUrl({ error: "menu_import_failed", detail: error instanceof Error ? error.message : "Unknown error" }));
  }
  revalidatePath(PAGE_PATH);
  redirect(pageUrl({ success: "menu_imported", count: String(received) }));
}

export async function syncMockTicketData() {
  const { context, supabase, connection } = await loadConnection();
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  let received = 0;
  try {
    const result = await syncPosTickets(supabase, context, connection, createPosProvider("omnivore", "mock"), { from, to });
    received = result.received;
    await recordEvent(supabase, context.organizationId, "integration.sync_triggered", "pos_integration", connection.integration.id, result);
  } catch (error) {
    await recordEvent(supabase, context.organizationId, "integration.sync_failed", "pos_integration", connection.integration.id, { provider: "omnivore", error: error instanceof Error ? error.message : "Unknown error" });
    redirect(pageUrl({ error: "ticket_sync_failed", detail: error instanceof Error ? error.message : "Unknown error" }));
  }
  revalidatePath(PAGE_PATH);
  redirect(pageUrl({ success: "tickets_synced", count: String(received) }));
}

export async function updatePosItemMapping(formData: FormData) {
  const context = await requirePermission("integrations.pos.map");
  const posMenuItemId = String(formData.get("posMenuItemId") ?? "");
  const status = String(formData.get("mappingStatus") ?? "unmapped");
  const target = String(formData.get("menuTarget") ?? "");
  if (!posMenuItemId || !["unmapped", "mapped", "ignored", "needs_review"].includes(status)) {
    redirect(pageUrl({ error: "invalid_mapping" }));
  }
  const supabase = await createClient();
  const [{ data: posItem }, { data: workspace }] = await Promise.all([
    supabase.from("pos_menu_items").select("id, integration_id, external_item_id, name").eq("organization_id", context.organizationId).eq("id", posMenuItemId).maybeSingle(),
    supabase.from("workspace_states").select("data").eq("organization_id", context.organizationId).maybeSingle(),
  ]);
  if (!posItem) redirect(pageUrl({ error: "invalid_mapping" }));

  let menuItemId: string | null = null;
  let menuItemName: string | null = null;
  let variantKey: string | null = null;
  let variantName: string | null = null;
  if (status === "mapped") {
    let parsed: { menuItemId?: string; variantKey?: string } = {};
    try { parsed = JSON.parse(target) as { menuItemId?: string; variantKey?: string }; } catch { redirect(pageUrl({ error: "invalid_mapping" })); }
    const catalog = extractWorkspaceCatalog(workspace?.data);
    const item = catalog.menuItems.find((candidate) => candidate.id === parsed.menuItemId);
    const variant = item?.variants.find((candidate) => candidate.key === parsed.variantKey);
    if (!item || !variant) redirect(pageUrl({ error: "invalid_mapping" }));
    menuItemId = item.id;
    menuItemName = item.name;
    variantKey = variant.key;
    variantName = variant.name;
  }
  const now = new Date().toISOString();
  const { data: before } = await supabase.from("pos_item_mappings").select("mapping_status, month_end_menu_item_id, month_end_menu_variant_key").eq("pos_menu_item_id", posItem.id).maybeSingle();
  const { error } = await supabase.from("pos_item_mappings").upsert({
    organization_id: context.organizationId,
    integration_id: posItem.integration_id,
    pos_menu_item_id: posItem.id,
    external_item_id: posItem.external_item_id,
    external_item_name: posItem.name,
    month_end_menu_item_id: menuItemId,
    month_end_menu_item_name: menuItemName,
    month_end_menu_variant_key: variantKey,
    month_end_menu_variant_name: variantName,
    mapping_status: status,
    mapped_by: context.userId,
    mapped_at: status === "mapped" ? now : null,
    updated_at: now,
  }, { onConflict: "pos_menu_item_id" });
  if (error) redirect(pageUrl({ error: "mapping_failed" }));
  await recordEvent(supabase, context.organizationId, before ? "integration.mapping_changed" : "integration.item_mapped", "pos_menu_item", posItem.id, {
    external_item_id: posItem.external_item_id,
    status,
    menu_item_id: menuItemId,
    variant_key: variantKey,
  });
  revalidatePath(PAGE_PATH);
  redirect(pageUrl({ success: "mapping_saved" }));
}
