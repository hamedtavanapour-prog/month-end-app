import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { can, requireAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  "organization.bootstrap": "Created the workspace",
  "user.invited": "Invited a user",
  "user.invitation_accepted": "Accepted an invitation",
  "user.invitation_revoked": "Revoked an invitation",
  "user.access_updated": "Updated user access",
  "workspace.saved": "Saved workspace changes",
  "organization.created": "Created a restaurant workspace",
  "user.precreated": "Prepared a user account",
  "user.first_login_completed": "Completed first sign in",
  "count.created": "Created a count",
  "count.updated": "Updated a count",
  "count.archived": "Archived a count",
  "count.restored": "Restored a count",
  "count.deleted": "Deleted a count",
  "integration.configured": "Configured a POS integration",
  "integration.disconnected": "Disconnected a POS integration",
  "integration.menu_imported": "Imported a POS menu",
  "integration.item_mapped": "Mapped a POS menu item",
  "integration.mapping_changed": "Changed a POS menu mapping",
  "integration.sync_triggered": "Synchronized POS tickets",
  "integration.sync_failed": "POS synchronization failed",
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default async function ActivityPage() {
  const context = await requireAccessContext();
  if (!(["owner", "admin", "manager"] as string[]).includes(context.role)) redirect("/app");
  const supabase = await createClient();
  const [{ data: logs }, { data: profiles }, { data: memberships }] = await Promise.all([
    supabase.from("audit_logs").select("id, actor_user_id, action, entity_type, entity_id, after_data, created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("id, display_name, email"),
    supabase.from("memberships").select("user_id, job_title, role").eq("organization_id", context.organizationId),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const titleMap = new Map((memberships ?? []).map((membership) => [membership.user_id, membership.job_title || membership.role]));

  return <main className="team-shell">
    <aside className="team-sidebar">
      <Link className="legacy-brand" href="/app"><strong>Month&apos;s End</strong><span>{context.organizationName}</span></Link>
      <nav><Link href="/app">← Inventory workspace</Link><Link href="/app/people">People & Access</Link><Link href="/app/settings/departments">Organization structure</Link><span className="active">Activity log</span>{can(context, "integrations.pos.view") ? <Link href="/app/settings/integrations/pos">POS integrations</Link> : null}</nav>
      <div className="team-current-user"><b>{initials(context.displayName)}</b><span><strong>{context.displayName}</strong><small>{context.role}</small></span></div>
    </aside>
    <section className="team-content">
      <header className="team-header"><div><p className="eyebrow">Settings</p><h1>Activity log</h1><p>See who changed workspace access and when operational data was saved.</p></div><Link className="team-back" href="/app">Done</Link></header>
      <section className="access-card activity-card"><div className="access-card-heading"><div><h2>Recent activity</h2><p>Showing the latest {logs?.length ?? 0} events visible to your role.</p></div></div>
        <div className="activity-list">{logs?.length ? logs.map((log) => {
          const profile = log.actor_user_id ? profileMap.get(log.actor_user_id) : null;
          const actor = profile?.display_name || profile?.email || "System";
          return <article key={log.id}><b>{initials(actor)}</b><div><strong>{actor}</strong><span>{actionLabels[log.action] || log.action}</span><small>{log.actor_user_id ? `${titleMap.get(log.actor_user_id) || "Team member"} · ` : ""}{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}</small></div><time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</time></article>;
        }) : <div className="activity-empty">No activity has been recorded yet.</div>}</div>
      </section>
    </section>
  </main>;
}
