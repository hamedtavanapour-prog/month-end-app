import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { can, requireAccessContext } from "@/lib/auth/context";
import { calculateTheoreticalUsage } from "@/lib/pos/theoretical-usage";
import { extractWorkspaceCatalog } from "@/lib/pos/workspace-catalog";
import { createClient } from "@/lib/supabase/server";
import { disconnectMockConnection, enableMockConnection, importMockMenu, syncMockTicketData } from "./actions";
import { PosMappingTable } from "./mapping-table";

export const metadata: Metadata = { title: "POS Integrations" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string; detail?: string; count?: string }>;
};

const successMessages: Record<string, string> = {
  mock_connected: "Mock Omnivore connection enabled. No production POS is connected.",
  disconnected: "The mock connection is disabled. Imported test records remain available for audit.",
  menu_imported: "Mock POS menu imported successfully.",
  tickets_synced: "Sample tickets synchronized successfully.",
  mapping_saved: "POS menu mapping saved.",
};

const errorMessages: Record<string, string> = {
  mock_connection_required: "Enable the mock connection before importing data.",
  connection_failed: "The mock connection could not be enabled.",
  menu_import_failed: "The mock menu import failed.",
  ticket_sync_failed: "The sample ticket synchronization failed.",
  invalid_mapping: "Choose a valid Month End menu item and recipe size.",
  mapping_failed: "The POS menu mapping could not be saved.",
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default async function PosIntegrationPage({ searchParams }: PageProps) {
  const context = await requireAccessContext();
  if (!can(context, "integrations.pos.view")) redirect("/app/forbidden?from=/app/settings/integrations/pos");
  const canManage = can(context, "integrations.pos.manage");
  const canMap = can(context, "integrations.pos.map");
  const canSync = can(context, "integrations.pos.sync");
  const canViewErrors = can(context, "integrations.pos.errors");
  const params = await searchParams;
  const supabase = await createClient();
  const integrationResult = await supabase.from("pos_integrations").select("*")
    .eq("organization_id", context.organizationId).eq("provider", "omnivore").maybeSingle();

  if (integrationResult.error) return <IntegrationSchemaRequired context={context} error={integrationResult.error.message} />;
  const integration = integrationResult.data;
  const [locationsResult, menuItemsResult, mappingsResult, ticketsResult, ticketItemsResult, syncRunsResult, workspaceResult] = await Promise.all([
    supabase.from("pos_locations").select("*").eq("organization_id", context.organizationId).order("created_at"),
    supabase.from("pos_menu_items").select("*").eq("organization_id", context.organizationId).order("name"),
    supabase.from("pos_item_mappings").select("*").eq("organization_id", context.organizationId),
    supabase.from("pos_tickets").select("*").eq("organization_id", context.organizationId).order("closed_at", { ascending: false }).limit(50),
    supabase.from("pos_ticket_items").select("*").eq("organization_id", context.organizationId),
    supabase.from("pos_sync_runs").select("*").eq("organization_id", context.organizationId).order("started_at", { ascending: false }).limit(20),
    supabase.from("workspace_states").select("data").eq("organization_id", context.organizationId).maybeSingle(),
  ]);
  const locations = locationsResult.data ?? [];
  const menuItems = menuItemsResult.data ?? [];
  const mappings = mappingsResult.data ?? [];
  const tickets = ticketsResult.data ?? [];
  const ticketItems = ticketItemsResult.data ?? [];
  const syncRuns = syncRunsResult.data ?? [];
  const catalog = extractWorkspaceCatalog(workspaceResult.data?.data);
  const menuTargets = catalog.menuItems.flatMap((item) => item.variants.map((variant) => ({
    value: JSON.stringify({ menuItemId: item.id, variantKey: variant.key }),
    label: `${item.menuName} — ${item.name} — ${variant.name}`,
  }))).sort((left, right) => left.label.localeCompare(right.label));
  const mappingByItem = new Map(mappings.map((mapping) => [mapping.pos_menu_item_id, mapping]));
  const mappingRows = menuItems.map((item) => {
    const mapping = mappingByItem.get(item.id);
    return {
      id: item.id,
      externalItemId: item.external_item_id,
      name: item.name,
      category: item.category ?? "",
      sku: item.sku ?? "",
      status: mapping?.mapping_status ?? "unmapped",
      target: mapping?.month_end_menu_item_id && mapping.month_end_menu_variant_key
        ? JSON.stringify({ menuItemId: mapping.month_end_menu_item_id, variantKey: mapping.month_end_menu_variant_key })
        : "",
      targetLabel: [mapping?.month_end_menu_item_name, mapping?.month_end_menu_variant_name].filter(Boolean).join(" — "),
    };
  });
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const theoretical = calculateTheoreticalUsage({
    saleLines: ticketItems.flatMap((item) => {
      const ticket = ticketsById.get(item.ticket_id);
      if (!ticket) return [];
      return [{
        id: item.id,
        ticketId: ticket.id,
        externalTicketId: ticket.external_ticket_id,
        ticketNumber: ticket.ticket_number,
        ticketStatus: ticket.status,
        posMenuItemId: item.pos_menu_item_id,
        externalMenuItemId: item.external_menu_item_id,
        name: item.name,
        quantity: Number(item.quantity),
        voided: item.is_voided,
        cancelled: item.is_cancelled,
      }];
    }),
    mappings: mappings.map((mapping) => ({
      posMenuItemId: mapping.pos_menu_item_id,
      status: mapping.mapping_status as "unmapped" | "mapped" | "ignored" | "needs_review",
      monthEndMenuItemId: mapping.month_end_menu_item_id,
      monthEndMenuVariantKey: mapping.month_end_menu_variant_key,
    })),
    menuItems: catalog.menuItems,
    products: catalog.products,
  });
  const mappedCount = mappings.filter((mapping) => mapping.mapping_status === "mapped").length;
  const unmappedCount = menuItems.length - mappings.filter((mapping) => ["mapped", "ignored"].includes(mapping.mapping_status)).length;
  const testMode = integration?.mode === "mock" && integration.status !== "disconnected";

  return <main className="team-shell pos-shell">
    <aside className="team-sidebar">
      <Link className="legacy-brand" href="/app"><strong>Month&apos;s End</strong><span>{context.organizationName}</span></Link>
      <nav>
        <Link href="/app">← Inventory workspace</Link>
        <Link href="/app/people">People & Access</Link>
        <Link href="/app/activity">Activity log</Link>
        <span className="active">POS integrations</span>
      </nav>
      <div className="team-current-user"><b>{initials(context.displayName)}</b><span><strong>{context.displayName}</strong><small>{context.role}</small></span></div>
    </aside>
    <section className="team-content pos-content">
      <header className="team-header"><div><p className="eyebrow">Settings · Integrations · POS</p><h1>Omnivore</h1><p>Read POS sales into Month End through a provider-neutral integration layer.</p></div><Link className="team-back" href="/app/settings/general">Done</Link></header>
      <div className="pos-test-banner" role="status"><strong>{testMode ? "TEST MODE" : "NOT CONNECTED"}</strong><span>{testMode ? "All records on this page come from deterministic mock fixtures. No production Omnivore location is connected." : "Production credentials and location authorization are not configured."}</span></div>
      {params.success ? <div className="success-alert">{successMessages[params.success] ?? "POS integration updated."}{params.count ? ` ${params.count} record(s) processed.` : ""}</div> : null}
      {params.error ? <div className="form-alert" role="alert">{errorMessages[params.error] ?? "The POS integration action failed."}{params.detail ? ` ${params.detail}` : ""}</div> : null}
      {canViewErrors && integration?.sync_error ? <div className="form-alert" role="alert"><strong>Last synchronization error:</strong> {integration.sync_error}</div> : null}

      <section className="pos-card pos-overview-card">
        <div className="pos-card-heading"><div><p className="eyebrow">Connection</p><h2>Omnivore read-only foundation</h2><p>Live API calls stay disabled until authorized credentials and confirmed version-matched documentation are available.</p></div><span className={`pos-connection-state ${testMode ? "is-test" : ""}`}>{testMode ? "Test mode" : integration?.status?.replace("_", " ") ?? "Not configured"}</span></div>
        <div className="pos-metric-grid">
          <div><span>Location</span><strong>{locations[0]?.name ?? "Not authorized"}</strong><small>{locations[0]?.external_location_id ?? "No external location ID"}</small></div>
          <div><span>Last sync</span><strong>{formatDate(integration?.last_sync_at)}</strong><small>Last success: {formatDate(integration?.last_successful_sync_at)}</small></div>
          <div><span>Imported items</span><strong>{menuItems.length}</strong><small>{mappedCount} mapped · {unmappedCount} to review</small></div>
          <div><span>Recent tickets</span><strong>{tickets.length}</strong><small>{ticketItems.length} ticket lines stored</small></div>
        </div>
        <div className="pos-action-row">
          {canManage && !testMode ? <form action={enableMockConnection}><button className="pos-primary-button" type="submit">Enable mock connection</button></form> : null}
          {canSync && testMode ? <form action={importMockMenu}><button type="submit">Import mock menu</button></form> : null}
          {canSync && testMode ? <form action={syncMockTicketData}><button type="submit">Sync sample tickets</button></form> : null}
          <button disabled title="Requires Omnivore credentials and location authorization" type="button">Test live connection</button>
          {canManage && testMode ? <form action={disconnectMockConnection}><button className="pos-danger-button" type="submit">Disable test mode</button></form> : null}
        </div>
      </section>

      <PosMappingTable canMap={canMap} rows={mappingRows} targets={menuTargets} />

      <section className="pos-card">
        <div className="pos-card-heading"><div><p className="eyebrow">Inventory intelligence</p><h2>Theoretical product usage</h2><p>Calculated from normalized ticket quantities, confirmed menu mappings, and existing Month End recipes.</p></div><span className="pos-count">{theoretical.productUsage.length} products</span></div>
        {theoretical.productUsage.length ? <div className="pos-usage-list">{theoretical.productUsage.map((usage) => <article key={usage.productId}>
          <div><strong>{usage.productName}</strong><small>{usage.sourceTicketItems} source ticket item(s)</small></div><b>{usage.ounces.toFixed(2)} oz</b><span>{usage.millilitres.toFixed(2)} ml</span>
        </article>)}</div> : <div className="pos-empty">Import tickets and map POS items to recipes to calculate theoretical usage.</div>}
        {theoretical.traces.length ? <details className="pos-trace"><summary>View {theoretical.traces.length} calculation trace lines</summary>{theoretical.traces.map((trace, index) => <div key={`${trace.ticketItemId}:${trace.recipeIngredientId}:${index}`}>
          <span>Ticket {trace.ticketNumber || trace.externalTicketId}</span><span>{trace.posItemName} × {trace.soldQuantity}</span><span>{trace.monthEndMenuItemName} · {trace.recipeVariantName}</span><span>{trace.recipeAmount} {trace.recipeIngredientName}</span><strong>{trace.productName}: {trace.millilitres.toFixed(2)} ml</strong>
        </div>)}</details> : null}
        {theoretical.issues.length ? <details className="pos-issues"><summary>{theoretical.issues.length} unresolved or intentionally skipped recipe lines</summary>{theoretical.issues.slice(0, 100).map((issue, index) => <div key={`${issue.ticketItemId}:${issue.reason}:${index}`}><strong>{issue.posItemName}</strong><span>{issue.reason.replace("_", " ")}: {issue.detail}</span></div>)}</details> : null}
      </section>

      <section className="pos-grid">
        <div className="pos-card"><div className="pos-card-heading"><div><h2>Recent tickets</h2><p>Idempotent imports keyed by external location and ticket ID.</p></div></div><div className="pos-compact-list">{tickets.length ? tickets.slice(0, 10).map((ticket) => <article key={ticket.id}><span><strong>#{ticket.ticket_number || ticket.external_ticket_id}</strong><small>{ticket.employee_name || "No employee"} · {ticket.status}</small></span><time>{formatDate(ticket.closed_at || ticket.opened_at)}</time></article>) : <div className="pos-empty">No sample tickets imported.</div>}</div></div>
        <div className="pos-card"><div className="pos-card-heading"><div><h2>Sync history</h2><p>Manual, scheduled, webhook, and reconciliation runs share one audit model.</p></div></div><div className="pos-compact-list">{syncRuns.length ? syncRuns.slice(0, 10).map((run) => <article key={run.id}><span><strong>{run.sync_kind.replace("_", " ")}</strong><small>{run.status} · {run.records_received} received · {run.records_created} created · {run.records_updated} updated</small>{canViewErrors && run.error ? <small className="pos-error-detail">{run.error}</small> : null}</span><time>{formatDate(run.started_at)}</time></article>) : <div className="pos-empty">No synchronization runs yet.</div>}</div></div>
      </section>
    </section>
  </main>;
}

function IntegrationSchemaRequired({ context, error }: { context: Awaited<ReturnType<typeof requireAccessContext>>; error: string }) {
  return <main className="team-shell pos-shell"><aside className="team-sidebar"><Link className="legacy-brand" href="/app"><strong>Month&apos;s End</strong><span>{context.organizationName}</span></Link></aside><section className="team-content pos-content"><header className="team-header"><div><p className="eyebrow">Settings · Integrations · POS</p><h1>Omnivore</h1><p>{context.organizationName}</p></div><Link className="team-back" href="/app">Done</Link></header><div className="form-alert" role="alert"><strong>Database migration required.</strong> Apply the provider-neutral POS migration before using this page. <small>{error}</small></div></section></main>;
}
