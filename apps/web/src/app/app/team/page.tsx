import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
import { getPublicAppUrl } from "@/lib/auth/public-url";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation, updateTeamMember } from "./actions";
import { PreparedAccountWizard } from "./prepared-account-wizard";
import { ThemeBridge } from "./theme-bridge";

export const metadata: Metadata = { title: "Users & access" };
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

  return (
    <main className={`team-shell ${params.embedded === "1" ? "team-shell-embedded" : ""}`}>
      <ThemeBridge />
      <aside className="team-sidebar">
        <Link className="legacy-brand" href="/app"><strong>ME / Keg Bar</strong><span>Inventory Manager</span></Link>
        <nav>
          <Link href="/app">← Inventory workspace</Link>
          <span className="active">Users & access</span>
          <Link href="/app">Departments</Link>
          <Link href="/app/activity">Activity log</Link>
        </nav>
        <div className="team-current-user">
          <b>{initials(context.displayName)}</b>
          <span><strong>{context.displayName}</strong><small>{context.role}</small></span>
        </div>
      </aside>

      <section className="team-content">
        <header className="team-header">
          <div><p className="eyebrow">Settings</p><h1>Users & access</h1><p>Control who can see and change each part of {context.organizationName}.</p></div>
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
          departments={departments.filter((department) => context.role !== "manager" || context.departmentIds.includes(department.id))}
          permissions={assignablePermissions}
          creatorRole={context.role}
          embedded={params.embedded === "1"}
        />

        <section className="access-card active-team-card">
          <div className="access-card-heading"><div><h2>Active team</h2><p>{memberships.length} people currently visible to you.</p></div></div>
          <div className="member-list">
            {memberships.map((member) => {
              const profile = profiles.get(member.user_id);
              const name = profile?.display_name || profile?.email || "Team member";
              const title = member.job_title || member.role;
              const assignedDepartments = new Set(departmentAssignments.filter((row) => row.membership_id === member.id).map((row) => row.department_id));
              const assignedPermissions = new Set(permissionAssignments.filter((row) => row.membership_id === member.id && row.allowed).map((row) => row.permission_key));
              const protectedMember = member.role === "owner" || member.id === context.membershipId;
              return (
                <details className="member-card" key={member.id}>
                  <summary><b>{initials(name)}</b><span><strong>{name}</strong><small>{title} · {profile?.email || "No email available"}{member.must_change_password ? " · Password setup required" : ""}</small></span><em className={`role-pill ${member.status}`}>{member.status}</em><i>⌄</i></summary>
                  {protectedMember ? (
                    <div className="protected-access"><strong>{member.role === "owner" ? "Owner access" : "Your account"}</strong><span>This account is protected from changes here.</span></div>
                  ) : (
                    <form action={updateTeamMember} className="member-editor">
                      {params.embedded === "1" ? <input name="embedded" type="hidden" value="1" /> : null}
                      <input name="membershipId" type="hidden" value={member.id} />
                      <div className="team-form-grid compact">
                        <label><span>Role</span><select name="role" defaultValue={member.role}>
                          {context.role === "owner" ? <option value="admin">Administrator</option> : null}
                          {context.role !== "manager" ? <option value="manager">Manager</option> : null}
                          <option value="staff">Staff</option>
                        </select></label>
                        <label><span>Status</span><select name="status" defaultValue={member.status}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
                      </div>
                      <fieldset><legend>Departments</legend><div className="choice-grid">
                        {departments.filter((department) => context.role !== "manager" || context.departmentIds.includes(department.id)).map((department) => (
                          <label className="choice" key={department.id}><input name="departments" type="checkbox" value={department.id} defaultChecked={assignedDepartments.has(department.id)} /><span>{department.name}</span></label>
                        ))}
                      </div></fieldset>
                      <fieldset><legend>Permissions</legend><div className="choice-grid">
                        {assignablePermissions.map((permission) => (
                          <label className="choice" key={permission.key}><input name="permissions" type="checkbox" value={permission.key} defaultChecked={assignedPermissions.has(permission.key)} /><span>{permission.label}</span></label>
                        ))}
                      </div></fieldset>
                      <div className="team-form-actions"><button type="submit">Save access</button></div>
                    </form>
                  )}
                </details>
              );
            })}
          </div>
        </section>

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
