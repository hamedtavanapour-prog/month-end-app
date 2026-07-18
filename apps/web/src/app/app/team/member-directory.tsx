"use client";

import { useState } from "react";

import { updateTeamMember } from "./actions";

export type TeamDepartment = { id: string; name: string };
export type TeamPermission = { key: string; area: string; label: string; description: string };
export type TeamMemberView = {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string;
  status: string;
  mustChangePassword: boolean;
  protected: boolean;
  departmentIds: string[];
  permissionKeys: string[];
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function roleLabel(role: string) {
  return role === "admin" ? "Administrator" : role[0]?.toUpperCase() + role.slice(1);
}

export function MemberDirectory({
  members,
  departments,
  permissions,
  contextRole,
  embedded,
}: {
  members: TeamMemberView[];
  departments: TeamDepartment[];
  permissions: TeamPermission[];
  contextRole: string;
  embedded: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const selected = members.find((member) => member.id === selectedId) ?? null;
  const selectedDepartments = selected ? departments.filter((department) => selected.departmentIds.includes(department.id)) : [];
  const selectedPermissions = selected ? permissions.filter((permission) => selected.permissionKeys.includes(permission.key)) : [];
  const permissionAreas = Array.from(new Set(selectedPermissions.map((permission) => permission.area)));

  function openMember(id: string) {
    setSelectedId(id);
    setEditing(false);
    window.parent?.postMessage({ type: "month-end-team-focus" }, window.location.origin);
  }

  function closeMember() {
    setSelectedId(null);
    setEditing(false);
  }

  return (
    <>
      <section className="team-directory">
        <div className="team-directory-heading">
          <div><h2>Active team</h2><p>{members.length} people currently visible to you.</p></div>
        </div>
        <div className="member-list">
          {members.map((member) => (
            <button className="member-row" key={member.id} type="button" onClick={() => openMember(member.id)}>
              <b>{initials(member.name)}</b>
              <span><strong>{member.name}</strong><small>{member.jobTitle} · {member.email}{member.mustChangePassword ? " · Password setup required" : ""}</small></span>
              <em className={`role-pill ${member.status}`}>{member.status}</em>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <div className="member-profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMember(); }}>
          <section className="member-profile-modal" role="dialog" aria-modal="true" aria-labelledby="member-profile-title">
            <header className="member-profile-header">
              <div className="member-profile-identity"><b>{initials(selected.name)}</b><span><small>Team profile</small><h2 id="member-profile-title">{selected.name}</h2><p>{selected.email}</p></span></div>
              <div className="member-profile-actions">
                {!selected.protected && !editing ? <button className="profile-edit-button" type="button" onClick={() => setEditing(true)}>Edit</button> : null}
                <button className="profile-close-button" type="button" aria-label="Close team profile" onClick={closeMember}>×</button>
              </div>
            </header>

            {editing ? (
              <form action={updateTeamMember} className="member-profile-form">
                {embedded ? <input name="embedded" type="hidden" value="1" /> : null}
                <input name="membershipId" type="hidden" value={selected.id} />

                <section className="member-profile-section">
                  <div className="member-profile-section-title"><span>01</span><div><h3>Profile information</h3><p>Name, position, role, and account status.</p></div></div>
                  <div className="team-form-grid member-profile-fields">
                    <label><span>Name</span><input name="displayName" defaultValue={selected.name} maxLength={120} required /></label>
                    <label><span>Email</span><input value={selected.email} readOnly aria-describedby="email-readonly-note" /></label>
                    <label><span>Position</span><input name="jobTitle" defaultValue={selected.jobTitle} maxLength={120} required /></label>
                    <label><span>Role</span><select name="role" defaultValue={selected.role}>
                      {contextRole === "owner" ? <option value="admin">Administrator</option> : null}
                      {contextRole !== "manager" ? <option value="manager">Manager</option> : null}
                      <option value="staff">Staff</option>
                    </select></label>
                    <label><span>Status</span><select name="status" defaultValue={selected.status}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
                  </div>
                  <p className="member-field-note" id="email-readonly-note">Login email is protected. Account email changes require a separate identity-verification flow.</p>
                </section>

                <section className="member-profile-section">
                  <div className="member-profile-section-title"><span>02</span><div><h3>Department access</h3><p>Choose where this person can work and view data.</p></div></div>
                  <div className="choice-grid member-department-grid">
                    {departments.map((department) => <label className="choice" key={department.id}><input name="departments" type="checkbox" value={department.id} defaultChecked={selected.departmentIds.includes(department.id)} /><span>{department.name}</span></label>)}
                  </div>
                </section>

                <section className="member-profile-section">
                  <div className="member-profile-section-title"><span>03</span><div><h3>Permissions</h3><p>Individual actions this person can perform.</p></div></div>
                  <div className="permission-sections member-permission-editor">
                    {Array.from(new Set(permissions.map((permission) => permission.area))).map((area) => (
                      <div key={area}><h4>{area}</h4><div className="choice-grid">
                        {permissions.filter((permission) => permission.area === area).map((permission) => <label className="choice permission-choice" key={permission.key}><input name="permissions" type="checkbox" value={permission.key} defaultChecked={selected.permissionKeys.includes(permission.key)} /><span><strong>{permission.label}</strong><small>{permission.description}</small></span></label>)}
                      </div></div>
                    ))}
                  </div>
                </section>

                <footer className="member-profile-footer"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="submit">Save changes</button></footer>
              </form>
            ) : (
              <div className="member-profile-view">
                <section className="member-profile-section">
                  <div className="member-profile-section-title"><span>01</span><div><h3>Profile information</h3><p>Identity and role in this workspace.</p></div></div>
                  <dl className="member-detail-grid">
                    <div><dt>Position</dt><dd>{selected.jobTitle}</dd></div><div><dt>Role</dt><dd>{roleLabel(selected.role)}</dd></div><div><dt>Status</dt><dd><em className={`role-pill ${selected.status}`}>{selected.status}</em></dd></div><div><dt>Password</dt><dd>{selected.mustChangePassword ? "Setup required" : "Active"}</dd></div>
                  </dl>
                </section>
                <section className="member-profile-section">
                  <div className="member-profile-section-title"><span>02</span><div><h3>Department access</h3><p>Areas this person can work in.</p></div></div>
                  <div className="member-access-chips">{selectedDepartments.length ? selectedDepartments.map((department) => <span key={department.id}>{department.name}</span>) : <small>No departments assigned.</small>}</div>
                </section>
                <section className="member-profile-section">
                  <div className="member-profile-section-title"><span>03</span><div><h3>Permissions</h3><p>{selected.role === "owner" ? "The Owner has full workspace access." : `${selectedPermissions.length} assigned permissions.`}</p></div></div>
                  {selected.role === "owner" ? <div className="protected-profile-note">Full owner access is protected and cannot be reduced here.</div> : <div className="member-permission-view">{permissionAreas.map((area) => <div key={area}><h4>{area}</h4><div>{selectedPermissions.filter((permission) => permission.area === area).map((permission) => <span key={permission.key}>{permission.label}</span>)}</div></div>)}</div>}
                </section>
                {selected.protected && selected.role !== "owner" ? <div className="protected-profile-note">This is your account. Your own access is protected from changes here.</div> : null}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
