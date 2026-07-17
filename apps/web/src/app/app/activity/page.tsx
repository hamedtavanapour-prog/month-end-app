import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
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
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default async function ActivityPage() {
  const context = await requireAccessContext();
  if (!(["owner", "admin", "manager"] as string[]).includes(context.role)) redirect("/app");
  const supabase = await createClient();
  const [{ data: logs }, { data: profiles }] = await Promise.all([
    supabase.from("audit_logs").select("id, actor_user_id, action, entity_type, entity_id, after_data, created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return <main className="team-shell">
    <aside className="team-sidebar">
      <Link className="legacy-brand" href="/app"><strong>ME / Keg Bar</strong><span>Inventory Manager</span></Link>
      <nav><Link href="/app">← Inventory workspace</Link><Link href="/app/team">Users & access</Link><Link href="/app">Departments</Link><span className="active">Activity log</span></nav>
      <div className="team-current-user"><b>{initials(context.displayName)}</b><span><strong>{context.displayName}</strong><small>{context.role}</small></span></div>
    </aside>
    <section className="team-content">
      <header className="team-header"><div><p className="eyebrow">Settings</p><h1>Activity log</h1><p>See who changed workspace access and when operational data was saved.</p></div><Link className="team-back" href="/app">Done</Link></header>
      <section className="access-card activity-card"><div className="access-card-heading"><div><h2>Recent activity</h2><p>Showing the latest {logs?.length ?? 0} events visible to your role.</p></div></div>
        <div className="activity-list">{logs?.length ? logs.map((log) => {
          const profile = log.actor_user_id ? profileMap.get(log.actor_user_id) : null;
          const actor = profile?.display_name || profile?.email || "System";
          return <article key={log.id}><b>{initials(actor)}</b><div><strong>{actor}</strong><span>{actionLabels[log.action] || log.action}</span><small>{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}</small></div><time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</time></article>;
        }) : <div className="activity-empty">No activity has been recorded yet.</div>}</div>
      </section>
    </section>
  </main>;
}
