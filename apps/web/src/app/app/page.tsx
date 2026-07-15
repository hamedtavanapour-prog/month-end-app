import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Workspace" };
export const dynamic = "force-dynamic";

export default async function AppHome() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, role, status, organizations(id, name), membership_departments(departments(id, name))")
    .eq("user_id", userId)
    .eq("status", "active");

  const membership = memberships?.[0];
  const organization = Array.isArray(membership?.organizations)
    ? membership.organizations[0]
    : membership?.organizations;
  const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email : "Signed-in user";

  if (!membership || !organization) {
    return (
      <main className="setup-page">
        <div className="setup-card">
          <span className="brand-mark" aria-hidden="true">M</span>
          <p className="eyebrow">Account secured</p>
          <h1>Your workspace access is being prepared.</h1>
          <p>
            You are signed in as <strong>{email}</strong>, but this account has not
            been assigned to an organization yet.
          </p>
          <form action={signOut}><button className="secondary-button">Sign out</button></form>
        </div>
      </main>
    );
  }

  const departments = membership.membership_departments
    .flatMap((assignment) => assignment.departments ?? [])
    .map((department) => department.name);

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-lockup"><span className="brand-mark">M</span><span>Month End</span></div>
        <nav aria-label="Main navigation">
          <a className="active" href="/app">Overview</a>
          <span>Products</span><span>Live inventory</span><span>Counts</span>
          <span>Orders</span><span>Usage</span><span>Reports</span><span>Settings</span>
        </nav>
        <form action={signOut}><button className="sidebar-signout">Sign out</button></form>
      </aside>
      <section className="app-content">
        <header className="app-header">
          <div><p className="eyebrow">{organization.name}</p><h1>Workspace overview</h1></div>
          <div className="user-chip"><span>{email}</span><strong>{membership.role}</strong></div>
        </header>
        <div className="foundation-banner">
          <div><span className="status-dot" />Secure foundation active</div>
          <p>Authentication, organization boundaries, permissions, and audit history are connected.</p>
        </div>
        <section className="summary-grid">
          <article><span>Organization</span><strong>{organization.name}</strong><small>Isolated workspace</small></article>
          <article><span>Your role</span><strong className="capitalize">{membership.role}</strong><small>Database-enforced access</small></article>
          <article><span>Departments</span><strong>{departments.length || "All"}</strong><small>{departments.join(", ") || "Organization-wide access"}</small></article>
        </section>
        <section className="next-step-card">
          <p className="eyebrow">Foundation milestone</p>
          <h2>The new application is ready for its first owner.</h2>
          <p>Next we will activate the owner account, then build the team-management screen for inviting managers and staff.</p>
        </section>
      </section>
    </main>
  );
}
