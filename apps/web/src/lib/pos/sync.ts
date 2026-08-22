import "server-only";

import { createHash } from "node:crypto";

import type { AccessContext } from "@/lib/auth/context";
import type { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/database";
import type { PosIntegrationProvider, PosTicket } from "./domain";
import { planTicketIngestion } from "./ingestion";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PosIntegration = Tables<"pos_integrations">;
type PosLocation = Tables<"pos_locations">;

export type PosConnection = {
  integration: PosIntegration;
  location: PosLocation;
};

function ticketHash(ticket: PosTicket) {
  return createHash("sha256").update(JSON.stringify(ticket)).digest("hex");
}

async function startSyncRun(
  supabase: Supabase,
  context: AccessContext,
  connection: PosConnection,
  kind: "connection_test" | "menu" | "tickets" | "reconciliation",
  triggerType: "manual" | "scheduled" | "webhook" | "mock" = "mock",
  range?: { from: Date; to: Date },
) {
  const { data, error } = await supabase.from("pos_sync_runs").insert({
    organization_id: context.organizationId,
    integration_id: connection.integration.id,
    location_id: connection.location.id,
    sync_kind: kind,
    trigger_type: triggerType,
    status: "running",
    range_start: range?.from.toISOString() ?? null,
    range_end: range?.to.toISOString() ?? null,
    triggered_by: context.userId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function finishSyncRun(
  supabase: Supabase,
  runId: string,
  status: "succeeded" | "failed" | "partial",
  counts: { received?: number; created?: number; updated?: number; skipped?: number } = {},
  errorMessage?: string,
) {
  await supabase.from("pos_sync_runs").update({
    status,
    records_received: counts.received ?? 0,
    records_created: counts.created ?? 0,
    records_updated: counts.updated ?? 0,
    records_skipped: counts.skipped ?? 0,
    error: errorMessage ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}

export async function ensureMockConnection(
  supabase: Supabase,
  context: AccessContext,
  adapter: PosIntegrationProvider,
): Promise<PosConnection> {
  const validation = await adapter.validateConnection();
  if (!validation.ok || !validation.location) throw new Error(validation.message);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase.from("pos_integrations")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("provider", adapter.provider)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.mode === "live") throw new Error("Disconnect the live POS integration before enabling test mode.");

  const integrationMutation = existing
    ? supabase.from("pos_integrations").update({
      mode: "mock",
      status: "test_mode",
      integration_type: "read_only",
      configuration: { fixture: "month-end-pos-v1", contains_secrets: false },
      connected_at: existing.connected_at ?? now,
      sync_error: null,
      updated_by: context.userId,
      updated_at: now,
    }).eq("id", existing.id)
    : supabase.from("pos_integrations").insert({
      organization_id: context.organizationId,
      provider: adapter.provider,
      mode: "mock",
      status: "test_mode",
      integration_type: "read_only",
      configuration: { fixture: "month-end-pos-v1", contains_secrets: false },
      connected_at: now,
      created_by: context.userId,
      updated_by: context.userId,
    });
  const { data: integration, error: integrationError } = await integrationMutation.select("*").single();
  if (integrationError) throw new Error(integrationError.message);

  const posLocation = validation.location;
  const { data: location, error: locationError } = await supabase.from("pos_locations").upsert({
    organization_id: context.organizationId,
    integration_id: integration.id,
    external_location_id: posLocation.externalId,
    name: posLocation.name,
    timezone: posLocation.timezone ?? null,
    status: "active",
    metadata: (posLocation.metadata ?? {}) as Json,
    updated_at: now,
  }, { onConflict: "integration_id,external_location_id" }).select("*").single();
  if (locationError) throw new Error(locationError.message);
  return { integration, location };
}

export async function importPosMenu(
  supabase: Supabase,
  context: AccessContext,
  connection: PosConnection,
  adapter: PosIntegrationProvider,
) {
  const runId = await startSyncRun(supabase, context, connection, "menu");
  try {
    const items = await adapter.getMenuItems(connection.location.external_location_id);
    const existing = await supabase.from("pos_menu_items").select("external_item_id")
      .eq("organization_id", context.organizationId)
      .eq("location_id", connection.location.id);
    if (existing.error) throw new Error(existing.error.message);
    const existingIds = new Set((existing.data ?? []).map((item) => item.external_item_id));
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("pos_menu_items").upsert(items.map((item) => ({
      organization_id: context.organizationId,
      integration_id: connection.integration.id,
      location_id: connection.location.id,
      external_item_id: item.externalId,
      name: item.name,
      category: item.category ?? null,
      sku: item.sku ?? null,
      price: item.price ?? null,
      currency: item.currency ?? null,
      is_active: item.isActive,
      source_updated_at: item.updatedAt ?? null,
      imported_at: now,
      updated_at: now,
    })), { onConflict: "location_id,external_item_id" }).select("id, external_item_id");
    if (error) throw new Error(error.message);
    const created = items.filter((item) => !existingIds.has(item.externalId)).length;
    await finishSyncRun(supabase, runId, "succeeded", { received: items.length, created, updated: items.length - created });
    await updateSyncState(supabase, context, connection, now, null);
    return { received: data?.length ?? items.length, created, updated: items.length - created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Menu synchronization failed.";
    await finishSyncRun(supabase, runId, "failed", {}, message);
    await updateSyncState(supabase, context, connection, new Date().toISOString(), message);
    throw error;
  }
}

async function updateSyncState(
  supabase: Supabase,
  context: AccessContext,
  connection: PosConnection,
  timestamp: string,
  errorMessage: string | null,
) {
  const success = errorMessage ? {} : { last_successful_sync_at: timestamp };
  await Promise.all([
    supabase.from("pos_integrations").update({ last_sync_at: timestamp, ...success, sync_error: errorMessage, updated_by: context.userId, updated_at: timestamp }).eq("id", connection.integration.id),
    supabase.from("pos_locations").update({ last_sync_at: timestamp, ...success, sync_error: errorMessage, updated_at: timestamp }).eq("id", connection.location.id),
  ]);
}

export async function syncPosTickets(
  supabase: Supabase,
  context: AccessContext,
  connection: PosConnection,
  adapter: PosIntegrationProvider,
  range: { from: Date; to: Date },
  options: { kind?: "tickets" | "reconciliation"; triggerType?: "manual" | "scheduled" | "webhook" | "mock" } = {},
) {
  const runId = await startSyncRun(
    supabase,
    context,
    connection,
    options.kind ?? "tickets",
    options.triggerType ?? "mock",
    range,
  );
  try {
    const tickets = await adapter.getTickets(connection.location.external_location_id, range);
    const [{ data: currentTickets, error: ticketsError }, { data: menuItems, error: menuError }] = await Promise.all([
      supabase.from("pos_tickets").select("id, external_ticket_id, content_hash").eq("organization_id", context.organizationId).eq("location_id", connection.location.id),
      supabase.from("pos_menu_items").select("id, external_item_id").eq("organization_id", context.organizationId).eq("location_id", connection.location.id),
    ]);
    if (ticketsError) throw new Error(ticketsError.message);
    if (menuError) throw new Error(menuError.message);
    const menuByExternalId = new Map((menuItems ?? []).map((item) => [item.external_item_id, item.id]));
    const now = new Date().toISOString();
    const planned = planTicketIngestion(
      tickets.map((ticket) => ({ externalId: ticket.externalId, contentHash: ticketHash(ticket), value: ticket })),
      (currentTickets ?? []).map((ticket) => ({ externalId: ticket.external_ticket_id, contentHash: ticket.content_hash })),
    );
    if (planned.duplicateExternalIds.length) {
      throw new Error(`The POS response contained duplicate ticket IDs: ${planned.duplicateExternalIds.join(", ")}`);
    }
    const uniqueTickets = planned.unique.map((ticket) => ticket.value);
    const ticketRows = uniqueTickets.map((ticket) => ({
      organization_id: context.organizationId,
      integration_id: connection.integration.id,
      location_id: connection.location.id,
      external_ticket_id: ticket.externalId,
      ticket_number: ticket.ticketNumber ?? null,
      status: ticket.status,
      opened_at: ticket.openedAt ?? null,
      closed_at: ticket.closedAt ?? null,
      source_updated_at: ticket.updatedAt,
      external_employee_id: ticket.employee?.externalId ?? null,
      employee_name: ticket.employee?.name ?? null,
      guest_count: ticket.guestCount ?? null,
      subtotal: ticket.subtotal ?? null,
      total: ticket.total ?? null,
      currency: ticket.currency ?? null,
      content_hash: ticketHash(ticket),
      imported_at: now,
      updated_at: now,
    }));
    const { data: savedTickets, error: saveTicketsError } = await supabase.from("pos_tickets")
      .upsert(ticketRows, { onConflict: "location_id,external_ticket_id" })
      .select("id, external_ticket_id");
    if (saveTicketsError) throw new Error(saveTicketsError.message);
    const savedByExternalId = new Map((savedTickets ?? []).map((ticket) => [ticket.external_ticket_id, ticket.id]));
    const ticketIds = [...savedByExternalId.values()];
    const { data: existingItems, error: existingItemsError } = ticketIds.length
      ? await supabase.from("pos_ticket_items").select("id, ticket_id, external_ticket_item_id").in("ticket_id", ticketIds)
      : { data: [], error: null };
    if (existingItemsError) throw new Error(existingItemsError.message);
    const incomingItemKeys = new Set<string>();
    const itemRows = uniqueTickets.flatMap((ticket) => {
      const ticketId = savedByExternalId.get(ticket.externalId);
      if (!ticketId) return [];
      return ticket.items.map((item) => {
        incomingItemKeys.add(`${ticketId}:${item.externalId}`);
        return {
          organization_id: context.organizationId,
          integration_id: connection.integration.id,
          ticket_id: ticketId,
          pos_menu_item_id: item.externalMenuItemId ? menuByExternalId.get(item.externalMenuItemId) ?? null : null,
          external_ticket_item_id: item.externalId,
          external_menu_item_id: item.externalMenuItemId ?? null,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice ?? null,
          total: item.total ?? null,
          is_voided: item.voided ?? false,
          is_cancelled: item.cancelled ?? false,
          modifiers: (item.modifiers ?? []) as unknown as Json,
          updated_at: now,
        };
      });
    });
    if (itemRows.length) {
      const { error: itemError } = await supabase.from("pos_ticket_items").upsert(itemRows, { onConflict: "ticket_id,external_ticket_item_id" });
      if (itemError) throw new Error(itemError.message);
    }
    const staleItemIds = (existingItems ?? []).filter((item) => !incomingItemKeys.has(`${item.ticket_id}:${item.external_ticket_item_id}`)).map((item) => item.id);
    if (staleItemIds.length) {
      const { error: staleError } = await supabase.from("pos_ticket_items").update({ is_cancelled: true, updated_at: now }).in("id", staleItemIds).eq("organization_id", context.organizationId);
      if (staleError) throw new Error(staleError.message);
    }
    const created = planned.created.length;
    const updated = planned.updated.length;
    const skipped = planned.skipped.length;
    await finishSyncRun(supabase, runId, "succeeded", { received: uniqueTickets.length, created, updated, skipped });
    await updateSyncState(supabase, context, connection, now, null);
    return { received: uniqueTickets.length, created, updated, skipped, items: itemRows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ticket synchronization failed.";
    await finishSyncRun(supabase, runId, "failed", {}, message);
    await updateSyncState(supabase, context, connection, new Date().toISOString(), message);
    throw error;
  }
}

export function reconcilePosTickets(
  supabase: Supabase,
  context: AccessContext,
  connection: PosConnection,
  adapter: PosIntegrationProvider,
  range: { from: Date; to: Date },
  triggerType: "manual" | "scheduled" = "scheduled",
) {
  return syncPosTickets(supabase, context, connection, adapter, range, {
    kind: "reconciliation",
    triggerType,
  });
}
