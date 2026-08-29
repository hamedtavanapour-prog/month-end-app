import { createPosition } from "./actions";

type Location = { id: string; name: string };
type Department = { id: string; name: string; location_id: string | null };
type Permission = { key: string; area: string; label: string; description: string };
type Position = {
  id: string;
  name: string;
  description: string;
  can_manage_people: boolean;
  location_id: string | null;
};

export function PositionDirectory({
  positions,
  locations,
  departments,
  permissions,
  positionDepartmentIds,
  positionPermissionCounts,
  canCreate,
}: {
  positions: Position[];
  locations: Location[];
  departments: Department[];
  permissions: Permission[];
  positionDepartmentIds: Map<string, string[]>;
  positionPermissionCounts: Map<string, number>;
  canCreate: boolean;
}) {
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const permissionAreas = Array.from(new Set(permissions.map((permission) => permission.area)));

  return <section className="access-card position-directory" id="positions">
    <div className="access-card-heading">
      <div><h2>Positions</h2><p>Reusable access templates created by restaurant leadership.</p></div>
      <span className="structure-count">{positions.length}</span>
    </div>
    <div className="position-list">
      {positions.map((position) => {
        const departmentLabels = (positionDepartmentIds.get(position.id) ?? []).map((id) => departmentNames.get(id)).filter(Boolean);
        return <article className="position-row" key={position.id}>
          <div><strong>{position.name}</strong><small>{position.location_id ? locationNames.get(position.location_id) : "Organization-wide"}{position.can_manage_people ? " · Can manage people" : ""}</small></div>
          <p>{position.description || "Custom position"}</p>
          <div className="position-metadata"><span>{departmentLabels.join(", ") || "No default department"}</span><span>{positionPermissionCounts.get(position.id) ?? 0} permissions</span></div>
        </article>;
      })}
    </div>
    {canCreate ? <details className="position-create">
      <summary>Create a custom position</summary>
      <form action={createPosition} className="team-form position-form">
        <div className="team-form-grid">
          <label><span>Position name</span><input name="name" placeholder="e.g. Beverage Inventory Lead" maxLength={120} required /></label>
          <label><span>Location</span><select name="locationId" required><option value="">Choose a location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="position-description"><span>Description</span><input name="description" placeholder="What this position is responsible for" maxLength={240} /></label>
          <label className="choice position-manage-toggle"><input name="canManagePeople" type="checkbox" /><span><strong>Can manage people</strong><small>May manage assigned staff within the holder&apos;s authorized scope.</small></span></label>
        </div>
        <fieldset><legend>Default departments</legend><div className="choice-grid">{departments.map((department) => <label className="choice" key={department.id}><input name="departments" type="checkbox" value={department.id} /><span>{department.name}</span></label>)}</div></fieldset>
        <label className="primary-choice"><span>Primary department</span><select name="primaryDepartment"><option value="">None</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        <fieldset><legend>Position permissions</legend><div className="permission-sections">{permissionAreas.map((area) => <div key={area}><h3>{area}</h3><div className="choice-grid">{permissions.filter((permission) => permission.area === area).map((permission) => <label className="choice permission-choice" key={permission.key}><input name="permissions" type="checkbox" value={permission.key} /><span><strong>{permission.label}</strong><small>{permission.description}</small></span></label>)}</div></div>)}</div></fieldset>
        <div className="team-form-actions"><button type="submit">Create position</button></div>
      </form>
    </details> : null}
  </section>;
}
