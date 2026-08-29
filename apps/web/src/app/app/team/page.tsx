import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { can, requireAccessContext } from "@/lib/auth/context";
import { getPublicAppUrl } from "@/lib/auth/public-url";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation } from "./actions";
import { MemberDirectory } from "./member-directory";
import { PreparedAccountWizard } from "./prepared-account-wizard";
import { ThemeBridge } from "./theme-bridge";

export const metadata: Metadata = { title: "People & Access" };
export const dynamic = "force-dynamic";

type TeamPageProps = {
  searchParams: Promise<{
    created?: string;
    token?: string;
    updated?: string;
    revoked?: string;
    error?: string;
    delivery?: string;
    prepared?: string;
    embedded?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_invitation: "Enter a name, valid email, and at least one permission.",
  invalid_prepared_account: "Enter a name, job title, email, a 12-character temporary password, and at least one permission.",
  server_setup_required: "Secure account creation is not configured on this server yet.",
  account_exists: "An account already exists for that email address.",
  already_member: "That person is already a member of this workspace.",
  owner_required: "Only the Owner can create or manage another administrator.",
  manager_scope: "Managers can only create staff within their assigned departments.",
  invite_failed: "The invitation could not be created.",
  update_failed: "That user’s access could not be updated.",
  revoke_failed: "The invitation could not be revoked.",
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const context = await requireAccessContext();
  if (!(["owner", "admin", "manager"] as string[]).includes(context.role)) redirect("/app");

  const supabase = await createClient();
  const params = await searchParams;
  const [departmentsResult, permissionsResult, membershipsResult, departmentAssignmentsResult, permissionAssignmentsResult, profilesResult, invitationsResult] = await Promise.all([
    supabase.from("departments").select("id, name").eq("organization_id", context.organizationId).is("archived_at", null).order("name"),
    supabase.from("permission_definitions").select("key, area, label, description, manager_assignable").order("area").order("label"),
    supabase.from("memberships").select("id, user_id, role, job_title, must_change_password, status, reports_to_membership_id, created_at").eq("organization_id", context.organizationId).order("status").order("created_at"),
    supabase.from("membership_departments").select("membership_id, department_id"),
    supabase.from("membership_permissions").select("membership_id, permission_key, allowed"),
    supabase.from("profiles").select("id, display_name, email"),
    supabase.from("invitations").select("id, email, display_name, role, status, expires_at, invited_by, created_at").eq("organization_id", context.organizationId).eq("status", "pending").order("created_at", { ascending: false }),
  ]);

  const departments = departmentsResult.data ?? [];
  const allPermissions = permissionsResult.data ?? [];
  const assignablePermissions = context.role === "manager"
    ? allPermissions.filter((permission) => permission.manager_assignable)
    : allPermissions;
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const departmentAssignments = departmentAssignmentsResult.data ?? [];
  const permissionAssignments = permissionAssignmentsResult.data ?? [];
  const allMemberships = membershipsResult.data ?? [];
  const memberships = context.role === "manager"
    ? allMemberships.filter((member) => member.id === context.membershipId || member.reports_to_membership_id === context.membershipId)
    : allMemberships;
  const invitations = (invitationsResult.data ?? []).filter((invitation) => (
    context.role !== "manager" || invitation.invited_by === context.userId
  ));
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const configuredPublicUrl = getPublicAppUrl();
  const pageOrigin = configuredPublicUrl.includes("localhost") ? `${protocol}://${host}` : configuredPublicUrl;
  const inviteUrl = params.token ? `${pageOrigin}/invite/${params.token}` : null;
  const visibleDepartments = departments.filter((department) => context.role !== "manager" || context.departmentIds.includes(department.id));
  const teamMembers = memberships.map((member) => {
    const profile = profiles.get(member.user_id);
    return {
      id: member.id,
      name: profile?.display_name || profile?.email || "Team member",
      email: profile?.email || "No email available",
      role: member.role,
      jobTitle: member.job_title || member.role,
      status: member.status,
      mustChangePassword: member.must_change_password,
      protected: member.role === "owner" || member.id === context.membershipId,
      departmentIds: departmentAssignments.filter((row) => row.membership_id === member.id).map((row) => row.department_id),
      permissionKeys: permissionAssignments.filter((row) => row.membership_id === member.id && row.allowed).map((row) => row.permission_key),
    };
  });

  return (
    <main className={`team-shell ${params.embedded === "1" ? "team-shell-embedded" : ""}`}>
      <ThemeBridge />
      <aside className="team-sidebar">
        <Link className="legacy-brand" href="/app"><strong>Month&apos;s End</strong><span>{context.organizationName}</span></Link>
        <nav>
          <Link href="/app">← Inventory workspace</Link>
          <span className="active">People & Access</span>
          <Link href="/app/settings/departments">Organization structure</Link>
          <Link href="/app/activity">Activity log</Link>
          {can(context, "integrations.pos.view") ? <Link href="/app/settings/integrations/pos">POS integrations</Link> : null}
        </nav>
        <div className="team-current-user">
          <b>{initials(context.displayName)}</b>
          <span><strong>{context.displayName}</strong><small>{context.role}</small></span>
        </div>
      </aside>

      <section className="team-content">
        <header className="team-header">
          <div><p className="eyebrow">Administration</p><h1>People & Access</h1><p>Manage people, responsibilities, and effective access across {context.organizationName}.</p></div>
          {params.embedded === "1" ? null : <Link className="team-back" href="/app">Done</Link>}
        </header>

        {params.error ? <div className="form-alert" role="alert">{errorMessages[params.error] ?? "Something went wrong."}</div> : null}
        {params.updated ? <div className="success-alert">User access updated.</div> : null}
        {params.revoked ? <div className="success-alert">Invitation revoked.</div> : null}
        {params.prepared ? <div className="success-alert">{params.prepared}&apos;s account is ready. {params.delivery === "email" ? "The login link was emailed." : "Give them the login link and temporary password directly."}</div> : null}
        {inviteUrl ? (
          <div className={`invite-result ${params.delivery === "failed" ? "delivery-warning" : ""}`}>
            <div>
              <strong>{params.delivery === "email" ? `Invitation emailed to ${params.created}` : `Invitation ready for ${params.created}`}</strong>
              <span>{params.delivery === "email" ? "The newest secure link was sent automatically. You can also copy it below." : "Email delivery was unavailable. Copy and send this newest link; it expires in 7 days."}</span>
            </div>
            <input readOnly value={inviteUrl} aria-label="Invitation link" />
          </div>
        ) : null}

        <PreparedAccountWizard
          departments={visibleDepartments}
          permissions={assignablePermissions}
          creatorRole={context.role}
          embedded={params.embedded === "1"}
        />

        <MemberDirectory members={teamMembers} departments={visibleDepartments} permissions={assignablePermissions} contextRole={context.role} embedded={params.embedded === "1"} />

        {invitations.length ? <section className="access-card pending-invitations-card">
          <div className="access-card-heading"><div><h2>Pending invitations</h2><p>Invitations expire automatically after seven days.</p></div></div>
          <div className="pending-list">{invitations.map((invitation) => (
            <div key={invitation.id}><span><strong>{invitation.display_name || invitation.email}</strong><small>{invitation.email} · {invitation.role}</small></span><time>{new Date(invitation.expires_at).toLocaleDateString("en-CA")}</time><form action={revokeInvitation}>{params.embedded === "1" ? <input name="embedded" type="hidden" value="1" /> : null}<input name="invitationId" type="hidden" value={invitation.id} /><button className="danger-button" type="submit">Revoke</button></form></div>
          ))}</div>
        </section> : null}
      </section>
    </main>
  );
}
