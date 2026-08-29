import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { can, requireAccessContext } from "@/lib/auth/context";
import { getPublicAppUrl } from "@/lib/auth/public-url";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation } from "./actions";
import { MemberDirectory } from "./member-directory";
import { PositionDirectory } from "./position-directory";
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
    position_created?: string;
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
  invalid_position: "Enter a position name, location, and at least one permission.",
  position_exists: "A position with that name already exists in this location.",
  permission_ceiling: "A position cannot grant access that you do not have.",
  position_scope: "You can only create positions inside locations you manage.",
  position_failed: "The position could not be created.",
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const context = await requireAccessContext();
  if (!context.canManagePeople && !(["owner", "admin", "manager"] as string[]).includes(context.role)) redirect("/app");

  const supabase = await createClient();
  const params = await searchParams;
  const [departmentsResult, permissionsResult, membershipsResult, departmentAssignmentsResult, permissionAssignmentsResult, profilesResult, invitationsResult, regionsResult, locationsResult, positionsResult, positionDepartmentsResult, positionPermissionsResult, membershipPositionsResult, membershipLocationsResult, reportingLinesResult] = await Promise.all([
    supabase.from("departments").select("id, name, location_id").eq("organization_id", context.organizationId).is("archived_at", null).order("name"),
    supabase.from("permission_definitions").select("key, area, label, description, manager_assignable").order("area").order("label"),
    supabase.from("memberships").select("id, user_id, role, job_title, must_change_password, status, reports_to_membership_id, created_at").eq("organization_id", context.organizationId).order("status").order("created_at"),
    supabase.from("membership_departments").select("membership_id, department_id, is_primary"),
    supabase.from("membership_permissions").select("membership_id, permission_key, allowed"),
    supabase.from("profiles").select("id, display_name, email"),
    supabase.from("invitations").select("id, email, display_name, role, status, expires_at, invited_by, created_at").eq("organization_id", context.organizationId).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("regions").select("id, name").eq("organization_id", context.organizationId).is("archived_at", null).order("name"),
    supabase.from("locations").select("id, name, region_id").eq("organization_id", context.organizationId).is("archived_at", null).order("name"),
    supabase.from("positions").select("id, name, description, can_manage_people, region_id, location_id").eq("organization_id", context.organizationId).is("archived_at", null).order("name"),
    supabase.from("position_departments").select("position_id, department_id, is_primary"),
    supabase.from("position_permissions").select("position_id, permission_key, allowed"),
    supabase.from("membership_positions").select("membership_id, position_id, is_primary"),
    supabase.from("membership_location_assignments").select("membership_id, location_id, authority, is_primary"),
    supabase.from("membership_reporting_lines").select("membership_id, supervisor_membership_id, location_id"),
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
  const regions = regionsResult.data ?? [];
  const locations = locationsResult.data ?? [];
  const positions = positionsResult.data ?? [];
  const positionDepartments = positionDepartmentsResult.data ?? [];
  const positionPermissions = positionPermissionsResult.data ?? [];
  const membershipPositions = membershipPositionsResult.data ?? [];
  const membershipLocations = membershipLocationsResult.data ?? [];
  const reportingLines = reportingLinesResult.data ?? [];
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
      positionIds: membershipPositions.filter((row) => row.membership_id === member.id).map((row) => row.position_id),
      primaryPositionId: membershipPositions.find((row) => row.membership_id === member.id && row.is_primary)?.position_id ?? null,
      locationIds: membershipLocations.filter((row) => row.membership_id === member.id).map((row) => row.location_id),
      primaryLocationId: membershipLocations.find((row) => row.membership_id === member.id && row.is_primary)?.location_id ?? null,
      primaryDepartmentId: departmentAssignments.find((row) => row.membership_id === member.id && row.is_primary)?.department_id ?? null,
      supervisorMembershipId: reportingLines.find((row) => row.membership_id === member.id && row.location_id === null)?.supervisor_membership_id ?? member.reports_to_membership_id,
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
          <Link href="#positions">Positions</Link>
          <Link href="#structure">Organization structure</Link>
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
        {params.position_created ? <div className="success-alert">Position created and ready to assign.</div> : null}
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

        <section className="access-overview" aria-label="Organization access structure">
          <div><small>Customer</small><strong>{context.organizationName}</strong><span>Restaurant account</span></div>
          <div><small>Regions</small><strong>{regions.length}</strong><span>{regions.map((region) => region.name).join(", ") || "None"}</span></div>
          <div><small>Locations</small><strong>{locations.length}</strong><span>{locations.map((location) => location.name).join(", ") || "None"}</span></div>
          <div><small>Positions</small><strong>{positions.length}</strong><span>Reusable access templates</span></div>
        </section>

        <section className="access-card hierarchy-map" id="structure">
          <div className="access-card-heading"><div><h2>Authority map</h2><p>Platform administration stays separate from restaurant authority.</p></div></div>
          <div className="hierarchy-tree"><strong>Month&apos;s End platform</strong><span>└ Platform Administrator</span><span>　└ {context.organizationName}</span>{regions.map((region) => <span key={region.id}>　　└ {region.name}<br />　　　└ Regional Manager{locations.filter((location) => location.region_id === region.id).map((location) => <span key={location.id}><br />　　　　└ {location.name}<br />　　　　　└ General Manager<br />　　　　　　└ Custom positions → People</span>)}</span>)}</div>
        </section>

        <PreparedAccountWizard
          departments={visibleDepartments}
          permissions={assignablePermissions}
          positions={positions}
          creatorRole={context.role}
          embedded={params.embedded === "1"}
        />

        <MemberDirectory members={teamMembers} departments={visibleDepartments} permissions={assignablePermissions} positions={positions} locations={locations} contextRole={context.role} embedded={params.embedded === "1"} />

        <PositionDirectory
          positions={positions}
          locations={locations}
          departments={departments}
          permissions={assignablePermissions}
          positionDepartmentIds={new Map(positions.map((position) => [position.id, positionDepartments.filter((row) => row.position_id === position.id).map((row) => row.department_id)]))}
          positionPermissionCounts={new Map(positions.map((position) => [position.id, positionPermissions.filter((row) => row.position_id === position.id && row.allowed).length]))}
          canCreate={context.canManagePositions}
        />

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
