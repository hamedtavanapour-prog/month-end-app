"use client";

import { useMemo, useRef, useState } from "react";

import { createPreparedAccount } from "./actions";

type Department = { id: string; name: string };
type Permission = { key: string; area: string; label: string; description: string };
type CreatorRole = "owner" | "admin" | "manager" | "staff";
type AccessPreset = "full" | "manager" | "restricted" | "supporting" | "advanced";

const PRESETS: { id: AccessPreset; name: string; description: string }[] = [
  { id: "full", name: "Full access", description: "Every available page and action for this workspace." },
  { id: "manager", name: "Manager level", description: "Daily operations and reporting without user, department, or destructive controls." },
  { id: "restricted", name: "Restricted manager", description: "Run assigned departments with limited financial and settings access." },
  { id: "supporting", name: "Supporting staff", description: "View essential information and help with routine counts." },
  { id: "advanced", name: "Advanced", description: "Choose every permission individually." },
];

const ADMIN_KEYS = new Set(["counts.delete", "settings.departments", "settings.users", "settings.permissions"]);
const RESTRICTED_KEYS = new Set([
  "dashboard.view", "products.view", "products.manage", "inventory.view", "inventory.manage",
  "counts.view", "counts.create", "counts.finish", "orders.view", "orders.manage", "usage.view",
  "usage.upload", "suppliers.view", "reports.view", "settings.rooms",
]);
const SUPPORTING_KEYS = new Set([
  "dashboard.view", "products.view", "inventory.view", "counts.view", "counts.create",
  "orders.view", "usage.view", "suppliers.view",
]);

function randomPassword() {
  const required = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@$%"];
  const alphabet = required.join("");
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  const characters = required.map((set, index) => set[bytes[index] % set.length]);
  for (let index = required.length; index < bytes.length; index += 1) characters.push(alphabet[bytes[index] % alphabet.length]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = bytes[index] % (index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join("");
}

function presetKeys(preset: AccessPreset, permissions: Permission[]) {
  if (preset === "full") return new Set(permissions.map((permission) => permission.key));
  if (preset === "manager") return new Set(permissions.filter((permission) => !ADMIN_KEYS.has(permission.key)).map((permission) => permission.key));
  if (preset === "restricted") return new Set(permissions.filter((permission) => RESTRICTED_KEYS.has(permission.key)).map((permission) => permission.key));
  if (preset === "supporting") return new Set(permissions.filter((permission) => SUPPORTING_KEYS.has(permission.key)).map((permission) => permission.key));
  return new Set<string>();
}

export function PreparedAccountWizard({
  departments,
  permissions,
  creatorRole,
  embedded,
}: {
  departments: Department[];
  permissions: Permission[];
  creatorRole: CreatorRole;
  embedded: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState(creatorRole === "manager" ? "staff" : "manager");
  const [preset, setPreset] = useState<AccessPreset>(creatorRole === "manager" ? "supporting" : "manager");
  const [advancedPermissions, setAdvancedPermissions] = useState<Set<string>>(new Set());
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set(departments.map((department) => department.id)));

  const permissionAreas = useMemo(() => Array.from(new Set(permissions.map((permission) => permission.area))), [permissions]);
  const selectedPermissions = useMemo(
    () => preset === "advanced" ? advancedPermissions : presetKeys(preset, permissions),
    [advancedPermissions, permissions, preset],
  );

  function closeWizard() {
    setOpen(false);
    setStep(1);
    setCopied(false);
  }

  function continueToAccess() {
    if (!formRef.current?.reportValidity() || !temporaryPassword) return;
    setStep(2);
  }

  function chooseRole(nextRole: string) {
    setRole(nextRole);
    setPreset(nextRole === "admin" ? "full" : nextRole === "manager" ? "manager" : "supporting");
  }

  function togglePermission(key: string, checked: boolean) {
    setAdvancedPermissions((current) => {
      const next = new Set(current);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }

  function choosePreset(nextPreset: AccessPreset) {
    if (nextPreset === "advanced") setAdvancedPermissions(new Set(selectedPermissions));
    setPreset(nextPreset);
  }

  function toggleDepartment(id: string, checked: boolean) {
    setSelectedDepartments((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!open) {
    return (
      <section className="access-card invite-access-card prepared-account-card add-user-launch-card">
        <button className="add-user-launch" type="button" onClick={() => { setTemporaryPassword(randomPassword()); setOpen(true); window.parent?.postMessage({ type: "month-end-team-focus" }, window.location.origin); }}>
          <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
          <strong>Add a user</strong>
          <small>Create their account and assign access.</small>
        </button>
      </section>
    );
  }

  return (
    <div className="account-wizard-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWizard(); }}>
    <section className="access-card invite-access-card prepared-account-card account-wizard-card" role="dialog" aria-modal="true" aria-labelledby="account-wizard-title">
      <div className="account-wizard-heading">
        <div><p>Step {step} of 2</p><h2 id="account-wizard-title">{step === 1 ? "Account details" : "Access and permissions"}</h2></div>
        <button type="button" onClick={closeWizard} aria-label="Close user setup">×</button>
      </div>
      <div className="account-wizard-progress" aria-hidden="true"><span style={{ width: step === 1 ? "50%" : "100%" }} /></div>
      <form ref={formRef} action={createPreparedAccount} className="team-form account-wizard-form">
        {embedded ? <input name="embedded" type="hidden" value="1" /> : null}
        <input name="temporaryPassword" type="hidden" value={temporaryPassword} />

        <div className="account-wizard-step" hidden={step !== 1}>
          <div className="team-form-grid account-details-grid">
            <label><span>Name</span><input name="displayName" placeholder="e.g. Alex Morgan" required /></label>
            <label><span>Email</span><input name="email" type="email" placeholder="name@example.com" required /></label>
            <label><span>Role</span><select name="role" value={role} onChange={(event) => chooseRole(event.target.value)}>
              {creatorRole === "owner" ? <option value="admin">Administrator</option> : null}
              {creatorRole !== "manager" ? <option value="manager">Manager</option> : null}
              <option value="staff">Staff</option>
            </select></label>
            <label><span>Position</span><select name="jobTitle" defaultValue="Bar Manager">
              <option>General Manager</option><option>Bar Manager</option><option>Culinary Manager</option><option>Dining Room Manager</option><option>Assistant Manager</option><option>Inventory Manager</option><option>Team Member</option>
            </select></label>
          </div>
          <div className="generated-password">
            <div><span>Generated setup password</span><strong>{temporaryPassword || "Generating…"}</strong><small>The user will replace this password on first sign in.</small></div>
            <div><button type="button" onClick={copyPassword}>{copied ? "Copied" : "Copy"}</button><button type="button" onClick={() => { setTemporaryPassword(randomPassword()); setCopied(false); }}>Generate another</button></div>
          </div>
          <div className="team-form-actions"><button type="button" onClick={continueToAccess} disabled={!temporaryPassword}>Continue to access</button></div>
        </div>

        <div className="account-wizard-step" hidden={step !== 2}>
          <fieldset><legend>Access preset</legend><div className="access-preset-grid">
            {PRESETS.map((option) => (
              <label className={`access-preset ${preset === option.id ? "selected" : ""}`} key={option.id}>
                <input type="radio" name="accessPreset" value={option.id} checked={preset === option.id} onChange={() => choosePreset(option.id)} style={{ width: 16, height: 16, flex: "0 0 16px", padding: 0 }} />
                <span><strong>{option.name}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div></fieldset>

          <fieldset><legend>Departments</legend><div className="choice-grid">
            {departments.map((department) => (
              <label className="choice" key={department.id}><input name="departments" type="checkbox" value={department.id} checked={selectedDepartments.has(department.id)} onChange={(event) => toggleDepartment(department.id, event.target.checked)} /><span>{department.name}</span></label>
            ))}
          </div></fieldset>

          <fieldset className="advanced-permissions" hidden={preset !== "advanced"}><legend>Choose individual permissions</legend><div className="permission-sections">
            {permissionAreas.map((area) => (
              <div key={area}><h3>{area}</h3><div className="choice-grid">
                {permissions.filter((permission) => permission.area === area).map((permission) => (
                  <label className="choice permission-choice" key={permission.key}><input name="permissions" type="checkbox" value={permission.key} checked={selectedPermissions.has(permission.key)} onChange={(event) => togglePermission(permission.key, event.target.checked)} /><span><strong>{permission.label}</strong><small>{permission.description}</small></span></label>
                ))}
              </div></div>
            ))}
          </div></fieldset>
          <div className="account-wizard-actions"><button type="button" onClick={() => setStep(1)}>Back</button><button type="submit" disabled={!selectedDepartments.size || !selectedPermissions.size}>Create account</button></div>
        </div>
      </form>
    </section>
    </div>
  );
}
