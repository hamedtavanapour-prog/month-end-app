-- Multi-customer people and access foundation.
--
-- This migration is deliberately additive. Existing organizations,
-- memberships, roles, department assignments, and permission grants continue
-- to work while the native People & Access experience is introduced.

create table public.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  region_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'America/Toronto',
  inventory_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, slug),
  unique (id, organization_id),
  foreign key (region_id, organization_id)
    references public.regions(id, organization_id) on delete restrict
);

alter table public.memberships
  add constraint memberships_id_organization_unique unique (id, organization_id);

alter table public.departments
  add column location_id uuid,
  add column inventory_enabled boolean not null default true,
  add constraint departments_id_organization_unique unique (id, organization_id),
  add constraint departments_location_organization_fkey
    foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete restrict;

alter table public.membership_departments
  add column is_primary boolean not null default false;

create unique index membership_departments_one_primary_idx
  on public.membership_departments(membership_id)
  where is_primary;

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  region_id uuid,
  location_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  can_manage_people boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (not (region_id is not null and location_id is not null)),
  unique nulls not distinct (organization_id, region_id, location_id, slug),
  unique (id, organization_id),
  foreign key (region_id, organization_id)
    references public.regions(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete cascade
);

create table public.position_permissions (
  position_id uuid not null references public.positions(id) on delete cascade,
  permission_key text not null references public.permission_definitions(key) on delete cascade,
  allowed boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (position_id, permission_key)
);

create table public.position_departments (
  position_id uuid not null references public.positions(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (position_id, department_id)
);

create unique index position_departments_one_primary_idx
  on public.position_departments(position_id)
  where is_primary;

create table public.membership_region_assignments (
  membership_id uuid not null,
  organization_id uuid not null,
  region_id uuid not null,
  is_manager boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (membership_id, region_id),
  foreign key (membership_id, organization_id)
    references public.memberships(id, organization_id) on delete cascade,
  foreign key (region_id, organization_id)
    references public.regions(id, organization_id) on delete cascade
);

create table public.membership_location_assignments (
  membership_id uuid not null,
  organization_id uuid not null,
  location_id uuid not null,
  authority text not null default 'member'
    check (authority in ('location_admin', 'member')),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, location_id),
  foreign key (membership_id, organization_id)
    references public.memberships(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete cascade
);

create unique index membership_locations_one_primary_idx
  on public.membership_location_assignments(membership_id)
  where is_primary;

create table public.membership_positions (
  membership_id uuid not null,
  organization_id uuid not null,
  position_id uuid not null,
  location_id uuid,
  is_primary boolean not null default false,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (membership_id, position_id),
  foreign key (membership_id, organization_id)
    references public.memberships(id, organization_id) on delete cascade,
  foreign key (position_id, organization_id)
    references public.positions(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete cascade
);

create unique index membership_positions_one_primary_idx
  on public.membership_positions(membership_id)
  where is_primary;

create table public.membership_reporting_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid,
  membership_id uuid not null,
  supervisor_membership_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (membership_id <> supervisor_membership_id),
  foreign key (membership_id, organization_id)
    references public.memberships(id, organization_id) on delete cascade,
  foreign key (supervisor_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete cascade
);

create unique index membership_reporting_org_line_idx
  on public.membership_reporting_lines(membership_id)
  where location_id is null;

create unique index membership_reporting_location_line_idx
  on public.membership_reporting_lines(membership_id, location_id)
  where location_id is not null;

-- Preserve the existing manager-created reporting relationships in the new
-- structure. They remain organization-wide until a location is assigned.
insert into public.membership_reporting_lines (
  organization_id, membership_id, supervisor_membership_id, created_by
)
select organization_id, id, reports_to_membership_id, created_by
from public.memberships
where reports_to_membership_id is not null
on conflict do nothing;

create index regions_organization_idx on public.regions(organization_id);
create index locations_region_idx on public.locations(region_id);
create index locations_organization_idx on public.locations(organization_id);
create index departments_location_idx on public.departments(location_id);
create index positions_organization_idx on public.positions(organization_id);
create index positions_region_idx on public.positions(region_id);
create index positions_location_idx on public.positions(location_id);
create index membership_region_assignments_region_idx
  on public.membership_region_assignments(region_id);
create index membership_location_assignments_location_idx
  on public.membership_location_assignments(location_id);
create index membership_positions_position_idx on public.membership_positions(position_id);
create index membership_reporting_supervisor_idx
  on public.membership_reporting_lines(supervisor_membership_id);

alter table public.platform_administrators enable row level security;
alter table public.regions enable row level security;
alter table public.locations enable row level security;
alter table public.positions enable row level security;
alter table public.position_permissions enable row level security;
alter table public.position_departments enable row level security;
alter table public.membership_region_assignments enable row level security;
alter table public.membership_location_assignments enable row level security;
alter table public.membership_positions enable row level security;
alter table public.membership_reporting_lines enable row level security;

create policy regions_select_member
  on public.regions for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy regions_manage_organization_admin
  on public.regions for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

create policy locations_select_member
  on public.locations for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy locations_manage_organization_admin
  on public.locations for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

create policy positions_select_member
  on public.positions for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy positions_manage_organization_admin
  on public.positions for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

create policy position_permissions_select_member
  on public.position_permissions for select to authenticated
  using (
    exists (
      select 1 from public.positions position
      where position.id = position_id
        and (select private.is_org_member(position.organization_id))
    )
  );

create policy position_permissions_manage_organization_admin
  on public.position_permissions for all to authenticated
  using (
    exists (
      select 1 from public.positions position
      where position.id = position_id
        and (select private.has_org_role(position.organization_id, array['owner', 'admin']))
    )
  )
  with check (
    exists (
      select 1 from public.positions position
      where position.id = position_id
        and (select private.has_org_role(position.organization_id, array['owner', 'admin']))
    )
  );

create policy position_departments_select_member
  on public.position_departments for select to authenticated
  using (
    exists (
      select 1 from public.positions position
      where position.id = position_id
        and (select private.is_org_member(position.organization_id))
    )
  );

create policy position_departments_manage_organization_admin
  on public.position_departments for all to authenticated
  using (
    exists (
      select 1 from public.positions position
      where position.id = position_id
        and (select private.has_org_role(position.organization_id, array['owner', 'admin']))
    )
  )
  with check (
    exists (
      select 1 from public.positions position
      where position.id = position_id
        and (select private.has_org_role(position.organization_id, array['owner', 'admin']))
    )
  );

create policy membership_region_assignments_select_team
  on public.membership_region_assignments for select to authenticated
  using ((select private.can_view_membership(membership_id)));

create policy membership_location_assignments_select_team
  on public.membership_location_assignments for select to authenticated
  using ((select private.can_view_membership(membership_id)));

create policy membership_positions_select_team
  on public.membership_positions for select to authenticated
  using ((select private.can_view_membership(membership_id)));

create policy membership_reporting_lines_select_team
  on public.membership_reporting_lines for select to authenticated
  using (
    (select private.can_view_membership(membership_id))
    or (select private.can_view_membership(supervisor_membership_id))
  );

-- Assignment writes remain owner/admin-only during the compatibility phase.
-- Later RPCs will add region/location manager delegation with explicit ceilings.
create policy membership_region_assignments_manage_organization_admin
  on public.membership_region_assignments for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

create policy membership_location_assignments_manage_organization_admin
  on public.membership_location_assignments for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

create policy membership_positions_manage_organization_admin
  on public.membership_positions for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

create policy membership_reporting_lines_manage_organization_admin
  on public.membership_reporting_lines for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin'])));

grant select on public.regions, public.locations, public.positions,
  public.position_permissions, public.position_departments,
  public.membership_region_assignments,
  public.membership_location_assignments, public.membership_positions,
  public.membership_reporting_lines to authenticated;

grant insert, update, delete on public.regions, public.locations, public.positions,
  public.position_permissions, public.position_departments,
  public.membership_region_assignments,
  public.membership_location_assignments, public.membership_positions,
  public.membership_reporting_lines to authenticated;

revoke all on public.platform_administrators from public, anon, authenticated;
revoke all on public.regions, public.locations, public.positions,
  public.position_permissions, public.position_departments,
  public.membership_region_assignments,
  public.membership_location_assignments, public.membership_positions,
  public.membership_reporting_lines from anon;
