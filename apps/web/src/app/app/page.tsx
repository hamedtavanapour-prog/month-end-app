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

  return (
    <main className="legacy-host">
      <iframe
        className="legacy-frame"
        src="/legacy/index.html?v=department-setup-1"
        title={`${organization.name} inventory workspace for ${email}`}
      />
    </main>
  );
}
