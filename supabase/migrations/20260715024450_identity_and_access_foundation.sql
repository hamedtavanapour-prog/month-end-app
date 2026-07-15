create schema if not exists private;
revoke all on schema private from public, anon;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  reports_to_membership_id uuid references public.memberships(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, slug)
);

create table public.membership_departments (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (membership_id, department_id)
);

create table public.permission_definitions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),
  area text not null,
  label text not null,
  description text not null,
  manager_assignable boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.membership_permissions (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  permission_key text not null references public.permission_definitions(key) on delete cascade,
  allowed boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, permission_key)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'manager', 'staff')),
  reports_to_membership_id uuid references public.memberships(id) on delete set null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email, status)
);

create table public.invitation_departments (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (invitation_id, department_id)
);

create table public.invitation_permissions (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  permission_key text not null references public.permission_definitions(key) on delete cascade,
  allowed boolean not null default true,
  primary key (invitation_id, permission_key)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

create index memberships_user_id_idx on public.memberships(user_id);
create index memberships_organization_status_idx on public.memberships(organization_id, status);
create index departments_organization_id_idx on public.departments(organization_id);
create index membership_departments_department_idx on public.membership_departments(department_id);
create index invitations_organization_status_idx on public.invitations(organization_id, status);
create index invitations_email_idx on public.invitations(email);
create index audit_logs_organization_created_idx on public.audit_logs(organization_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);

create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = p_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    );
$$;

create or replace function private.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = p_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role = any(p_roles)
    );
$$;

create or replace function private.can_access_department(p_organization_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = p_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and (
          m.role in ('owner', 'admin')
          or exists (
            select 1
            from public.membership_departments md
            where md.membership_id = m.id
              and md.department_id = p_department_id
          )
        )
    );
$$;

create or replace function private.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships mine
      join public.memberships theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'
        and theirs.user_id = p_user_id
        and theirs.status = 'active'
    );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, text[]) from public, anon;
revoke all on function private.can_access_department(uuid, uuid) from public, anon;
revoke all on function private.shares_org_with(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.can_access_department(uuid, uuid) to authenticated;
grant execute on function private.shares_org_with(uuid) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''));
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

insert into public.permission_definitions (key, area, label, description, manager_assignable)
values
  ('dashboard.view', 'Dashboard', 'View dashboard', 'View operational dashboard summaries.', true),
  ('products.view', 'Products', 'View products', 'View products in assigned departments.', true),
  ('products.manage', 'Products', 'Manage products', 'Create and edit products in assigned departments.', true),
  ('products.view_costs', 'Products', 'View product costs', 'View packaging costs and inventory values.', true),
  ('inventory.view', 'Live inventory', 'View live inventory', 'View live inventory in assigned departments and rooms.', true),
  ('inventory.manage', 'Live inventory', 'Adjust live inventory', 'Apply approved inventory adjustments.', false),
  ('counts.view', 'Counts', 'View counts', 'View count sessions in assigned departments.', true),
  ('counts.create', 'Counts', 'Start counts', 'Create and work on count sessions.', true),
  ('counts.finish', 'Counts', 'Finish counts', 'Finalize a count and update the inventory baseline.', false),
  ('counts.delete', 'Counts', 'Delete counts', 'Delete or permanently remove count records.', false),
  ('orders.view', 'Orders', 'View orders', 'View orders in assigned departments.', true),
  ('orders.manage', 'Orders', 'Manage orders', 'Create, edit, and submit orders.', true),
  ('usage.view', 'Usage', 'View usage', 'View usage reports in assigned departments.', true),
  ('usage.upload', 'Usage', 'Upload usage reports', 'Upload and review inventory usage files.', true),
  ('usage.manage', 'Usage', 'Manage usage reports', 'Edit, archive, or delete usage reports.', false),
  ('suppliers.view', 'Suppliers', 'View suppliers', 'View supplier records.', true),
  ('suppliers.manage', 'Suppliers', 'Manage suppliers', 'Create and edit supplier records.', true),
  ('reports.view', 'Reports', 'View reports', 'View reports for authorized departments.', true),
  ('reports.export', 'Reports', 'Export reports', 'Export authorized operational data.', true),
  ('settings.rooms', 'Settings', 'Manage rooms', 'Create rooms and assign products.', true),
  ('settings.departments', 'Settings', 'Manage departments', 'Create and archive departments.', false),
  ('settings.users', 'Settings', 'Manage users', 'Invite, suspend, and organize team members.', false),
  ('settings.permissions', 'Settings', 'Manage permissions', 'Control roles and fine-grained access.', false);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.departments enable row level security;
alter table public.membership_departments enable row level security;
alter table public.permission_definitions enable row level security;
alter table public.membership_permissions enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_departments enable row level security;
alter table public.invitation_permissions enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_team
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select_member
  on public.organizations for select to authenticated
  using (private.is_org_member(id));

create policy organizations_update_admin
  on public.organizations for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']))
  with check (private.has_org_role(id, array['owner', 'admin']));

create policy memberships_select_member
  on public.memberships for select to authenticated
  using (private.is_org_member(organization_id));

create policy departments_select_member
  on public.departments for select to authenticated
  using (private.is_org_member(organization_id));

create policy departments_insert_admin
  on public.departments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_org_role(organization_id, array['owner', 'admin'])
  );

create policy departments_update_admin
  on public.departments for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));

create policy membership_departments_select_member
  on public.membership_departments for select to authenticated
  using (
    exists (
      select 1 from public.departments d
      where d.id = department_id
        and private.is_org_member(d.organization_id)
    )
  );

create policy permission_definitions_select_authenticated
  on public.permission_definitions for select to authenticated
  using (true);

create policy membership_permissions_select_member
  on public.membership_permissions for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id
        and private.is_org_member(m.organization_id)
    )
  );

create policy invitations_select_admin
  on public.invitations for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));

create policy invitation_departments_select_admin
  on public.invitation_departments for select to authenticated
  using (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id
        and private.has_org_role(i.organization_id, array['owner', 'admin', 'manager'])
    )
  );

create policy invitation_permissions_select_admin
  on public.invitation_permissions for select to authenticated
  using (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id
        and private.has_org_role(i.organization_id, array['owner', 'admin', 'manager'])
    )
  );

create policy audit_logs_select_leadership
  on public.audit_logs for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    or (
      private.has_org_role(organization_id, array['manager'])
      and (department_id is null or private.can_access_department(organization_id, department_id))
    )
  );

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update on public.departments to authenticated;
grant select on public.membership_departments to authenticated;
grant select on public.permission_definitions to authenticated;
grant select on public.membership_permissions to authenticated;
grant select on public.invitations to authenticated;
grant select on public.invitation_departments to authenticated;
grant select on public.invitation_permissions to authenticated;
grant select on public.audit_logs to authenticated;

revoke all on public.profiles from anon;
revoke all on public.organizations from anon;
revoke all on public.memberships from anon;
revoke all on public.departments from anon;
revoke all on public.membership_departments from anon;
revoke all on public.permission_definitions from anon;
revoke all on public.membership_permissions from anon;
revoke all on public.invitations from anon;
revoke all on public.invitation_departments from anon;
revoke all on public.invitation_permissions from anon;
revoke all on public.audit_logs from anon;
