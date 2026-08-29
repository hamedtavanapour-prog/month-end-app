import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { chooseWorkspace } from "./actions";

export const metadata: Metadata = { title: "Choose workspace" };
export const dynamic = "force-dynamic";

export default async function ChooseWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, job_title, organizations(name, slug)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!memberships?.length) redirect("/login?error=workspace_access");

  return (
    <main className="setup-page">
      <section className="setup-card workspace-choice-card">
        <span className="brand-mark" aria-hidden="true">ME</span>
        <p className="eyebrow">Your workspaces</p>
        <h1>Where are you working?</h1>
        <p>Choose one of the customer organizations assigned to your account.</p>
        {params.error ? <div className="form-alert" role="alert">That workspace is not available to this account.</div> : null}
        <div className="workspace-choice-list">
          {memberships.map((membership) => {
            const organization = Array.isArray(membership.organizations)
              ? membership.organizations[0]
              : membership.organizations;
            if (!organization) return null;
            return (
              <form action={chooseWorkspace} key={membership.id}>
                <input name="membershipId" type="hidden" value={membership.id} />
                <input name="next" type="hidden" value={params.next ?? "/app"} />
                <button type="submit">
                  <span><strong>{organization.name}</strong><small>{membership.job_title || "Team member"}</small></span>
                  <i aria-hidden="true">›</i>
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </main>
  );
}
