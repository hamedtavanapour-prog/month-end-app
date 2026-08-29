-- Convert the existing Keg workspace into the first customer/location model.
-- This is conditional so fresh installations and other customers are unchanged.

do $$
declare
  v_organization_id uuid;
  v_region_id uuid;
  v_location_id uuid;
  v_bar_department_id uuid;
  v_kitchen_department_id uuid;
  v_owner_user_id uuid;
begin
  select id into v_organization_id
  from public.organizations
  where slug = 'keg-bar';

  if v_organization_id is null then return; end if;

  update public.organizations
  set name = 'The Keg', updated_at = now()
  where id = v_organization_id;

  select membership.user_id into v_owner_user_id
  from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.role = 'owner'
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

  if v_owner_user_id is not null then
    insert into public.platform_administrators (user_id, granted_by)
    values (v_owner_user_id, v_owner_user_id)
    on conflict (user_id) do nothing;
  end if;

  insert into public.regions (organization_id, name, slug, created_by)
  values (v_organization_id, 'Toronto Region', 'toronto-region', v_owner_user_id)
  on conflict (organization_id, slug) do update set name = excluded.name
  returning id into v_region_id;

  insert into public.locations (
    organization_id, region_id, name, slug, timezone, inventory_enabled, created_by
  ) values (
    v_organization_id, v_region_id, 'North York', 'north-york', 'America/Toronto', true, v_owner_user_id
  )
  on conflict (organization_id, slug) do update
    set region_id = excluded.region_id, name = excluded.name, updated_at = now()
  returning id into v_location_id;

  update public.departments
  set location_id = v_location_id
  where departments.organization_id = v_organization_id and departments.location_id is null;

  select department.id into v_bar_department_id from public.departments department
  where department.organization_id = v_organization_id and lower(department.name) = 'bar' limit 1;
  select department.id into v_kitchen_department_id from public.departments department
  where department.organization_id = v_organization_id and lower(department.name) = 'kitchen' limit 1;

  insert into public.positions (
    organization_id, region_id, name, slug, description, can_manage_people, created_by
  ) values (
    v_organization_id, v_region_id, 'Regional Manager', 'regional-manager',
    'Oversees assigned locations within this region.', true, v_owner_user_id
  ) on conflict (organization_id, region_id, location_id, slug) do nothing;

  insert into public.positions (
    organization_id, location_id, name, slug, description, can_manage_people, created_by
  ) values
    (v_organization_id, v_location_id, 'General Manager', 'general-manager', 'Location administrator with full operational access.', true, v_owner_user_id),
    (v_organization_id, v_location_id, 'Bar Manager', 'bar-manager', 'Leads bar inventory and assigned bar staff.', true, v_owner_user_id),
    (v_organization_id, v_location_id, 'Kitchen Manager', 'kitchen-manager', 'Leads kitchen inventory and assigned kitchen staff.', true, v_owner_user_id),
    (v_organization_id, v_location_id, 'Assistant Manager', 'assistant-manager', 'Supports management across assigned departments.', true, v_owner_user_id),
    (v_organization_id, v_location_id, 'Team Member', 'team-member', 'Performs routine counts and inventory work in assigned departments.', false, v_owner_user_id)
  on conflict (organization_id, region_id, location_id, slug) do nothing;

  insert into public.position_permissions (position_id, permission_key, allowed, created_by)
  select position.id, definition.key, true, v_owner_user_id
  from public.positions position
  cross join public.permission_definitions definition
  where position.organization_id = v_organization_id
    and position.slug in ('regional-manager', 'general-manager')
  on conflict (position_id, permission_key) do nothing;

  insert into public.position_permissions (position_id, permission_key, allowed, created_by)
  select position.id, definition.key, true, v_owner_user_id
  from public.positions position
  cross join public.permission_definitions definition
  where position.organization_id = v_organization_id
    and position.slug in ('bar-manager', 'kitchen-manager', 'assistant-manager')
    and definition.manager_assignable
  on conflict (position_id, permission_key) do nothing;

  insert into public.position_permissions (position_id, permission_key, allowed, created_by)
  select position.id, definition.key, true, v_owner_user_id
  from public.positions position
  join public.permission_definitions definition on definition.key in (
    'dashboard.view', 'products.view', 'inventory.view', 'counts.view',
    'counts.create', 'orders.view', 'usage.view', 'suppliers.view'
  )
  where position.organization_id = v_organization_id and position.slug = 'team-member'
  on conflict (position_id, permission_key) do nothing;

  if v_bar_department_id is not null then
    insert into public.position_departments (position_id, department_id, is_primary, created_by)
    select position.id, v_bar_department_id, true, v_owner_user_id
    from public.positions position
    where position.organization_id = v_organization_id and position.slug = 'bar-manager'
    on conflict (position_id, department_id) do update set is_primary = true;
  end if;
  if v_kitchen_department_id is not null then
    insert into public.position_departments (position_id, department_id, is_primary, created_by)
    select position.id, v_kitchen_department_id, true, v_owner_user_id
    from public.positions position
    where position.organization_id = v_organization_id and position.slug = 'kitchen-manager'
    on conflict (position_id, department_id) do update set is_primary = true;
  end if;

  insert into public.membership_location_assignments (
    membership_id, organization_id, location_id, authority, is_primary, created_by
  )
  select membership.id, membership.organization_id, v_location_id,
    case when membership.role in ('owner', 'admin') then 'location_admin' else 'member' end,
    true, v_owner_user_id
  from public.memberships membership
  where membership.organization_id = v_organization_id
  on conflict (membership_id, location_id) do update
    set is_primary = excluded.is_primary;

  insert into public.membership_positions (
    membership_id, organization_id, position_id, location_id, is_primary, assigned_by
  )
  select membership.id, membership.organization_id, position.id, v_location_id, true, v_owner_user_id
  from public.memberships membership
  join public.positions position
    on position.organization_id = membership.organization_id
    and position.location_id = v_location_id
    and position.slug = case
      when lower(membership.job_title) = 'bar manager' then 'bar-manager'
      when lower(membership.job_title) in ('culinary manager', 'kitchen manager') then 'kitchen-manager'
      when lower(membership.job_title) = 'assistant manager' then 'assistant-manager'
      when lower(membership.job_title) = 'general manager' then 'general-manager'
      when membership.role = 'staff' then 'team-member'
      else '__unmapped__'
    end
  where membership.organization_id = v_organization_id
  on conflict (membership_id, position_id) do update set is_primary = true;

  with ranked as (
    select membership_id, department_id,
      row_number() over (partition by membership_id order by created_at, department_id) as position
    from public.membership_departments
    where membership_id in (
      select membership.id from public.memberships membership where membership.organization_id = v_organization_id
    )
  )
  update public.membership_departments assignment
  set is_primary = ranked.position = 1
  from ranked
  where assignment.membership_id = ranked.membership_id
    and assignment.department_id = ranked.department_id;

  -- Preserve the known current Bar reporting relationship without assigning
  -- anyone to the still-vacant General or Regional Manager positions.
  insert into public.membership_reporting_lines (
    organization_id, location_id, membership_id, supervisor_membership_id, created_by
  )
  select v_organization_id, v_location_id, staff.id, manager.id, v_owner_user_id
  from public.memberships staff
  join public.memberships manager on manager.organization_id = staff.organization_id
  where staff.organization_id = v_organization_id
    and lower(staff.job_title) = 'team member'
    and lower(manager.job_title) = 'bar manager'
    and exists (
      select 1
      from public.membership_departments staff_department
      join public.membership_departments manager_department
        on manager_department.department_id = staff_department.department_id
      where staff_department.membership_id = staff.id
        and manager_department.membership_id = manager.id
    )
  on conflict do nothing;
end;
$$;
