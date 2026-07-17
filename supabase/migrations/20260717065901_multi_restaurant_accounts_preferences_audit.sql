alter table public.memberships
  add column job_title text,
  add column must_change_password boolean not null default false,
  add column last_login_at timestamptz,
  add constraint memberships_job_title_length
    check (job_title is null or char_length(trim(job_title)) between 2 and 80);

create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

revoke all on table private.platform_admins from public, anon, authenticated;

insert into private.platform_admins (user_id)
select claimed_by
from private.initial_owner_bootstrap
where claimed_by is not null
on conflict (user_id) do nothing;

create table public.user_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint user_preferences_object check (jsonb_typeof(preferences) = 'object')
);

create index user_preferences_user_id_idx on public.user_preferences(user_id);

create table public.department_managers (
  department_id uuid not null references public.departments(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  is_primary boolean not null default false,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (department_id, membership_id)
);

create unique index department_managers_one_primary_idx
  on public.department_managers(department_id)
  where is_primary;
create index department_managers_membership_id_idx
  on public.department_managers(membership_id);

alter table public.user_preferences enable row level security;
alter table public.department_managers enable row level security;

create policy user_preferences_select_own
  on public.user_preferences for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_org_member(organization_id))
  );

create policy user_preferences_insert_own
  on public.user_preferences for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_org_member(organization_id))
  );

create policy user_preferences_update_own
  on public.user_preferences for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_org_member(organization_id))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_org_member(organization_id))
  );

create policy department_managers_select_member
  on public.department_managers for select to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = department_id
        and (select private.is_org_member(d.organization_id))
    )
  );

grant select, insert, update on table public.user_preferences to authenticated;
grant select on table public.department_managers to authenticated;
revoke all on table public.user_preferences from anon;
revoke all on table public.department_managers from anon;

create or replace function private.provision_team_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_job_title text,
  p_department_ids uuid[],
  p_permission_keys text[],
  p_must_change_password boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_membership public.memberships%rowtype;
  v_membership_id uuid;
begin
  select * into caller_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = caller_id
    and status = 'active';

  if caller_id is null or caller_membership.id is null then
    raise exception 'permission_denied';
  end if;
  if caller_membership.role not in ('owner', 'admin', 'manager') then
    raise exception 'permission_denied';
  end if;
  if p_role not in ('admin', 'manager', 'staff') then
    raise exception 'invalid_role';
  end if;
  if caller_membership.role = 'manager' and p_role <> 'staff' then
    raise exception 'manager_scope_exceeded';
  end if;
  if caller_membership.role = 'admin' and p_role = 'admin' then
    raise exception 'only_owner_can_create_admin';
  end if;
  if trim(coalesce(p_display_name, '')) = ''
    or char_length(trim(p_display_name)) > 120
    or lower(trim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or trim(coalesce(p_job_title, '')) = ''
    or char_length(trim(p_job_title)) > 80
  then
    raise exception 'invalid_profile';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'auth_user_not_found';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = p_user_id
  ) then
    raise exception 'already_a_member';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id)
    left join public.departments d
      on d.id = requested.id
      and d.organization_id = p_organization_id
      and d.archived_at is null
    where d.id is null
  ) then
    raise exception 'invalid_department';
  end if;
  if caller_membership.role = 'manager' and exists (
    select 1
    from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id)
    where not exists (
      select 1 from public.membership_departments md
      where md.membership_id = caller_membership.id
        and md.department_id = requested.id
    )
  ) then
    raise exception 'department_outside_manager_scope';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_permission_keys, array[]::text[])) requested(key)
    left join public.permission_definitions pd on pd.key = requested.key
    where pd.key is null
      or (caller_membership.role = 'manager' and pd.manager_assignable = false)
  ) then
    raise exception 'invalid_permission';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      email = lower(trim(p_email)),
      updated_at = now()
  where id = p_user_id;

  insert into public.memberships (
    organization_id, user_id, role, status, reports_to_membership_id,
    created_by, job_title, must_change_password
  ) values (
    p_organization_id, p_user_id, p_role, 'active',
    case when caller_membership.role = 'manager' then caller_membership.id else null end,
    caller_id, trim(p_job_title), p_must_change_password
  ) returning id into v_membership_id;

  insert into public.membership_departments (membership_id, department_id, created_by)
  select v_membership_id, id, caller_id
  from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id);

  insert into public.membership_permissions (membership_id, permission_key, allowed, granted_by)
  select v_membership_id, key, true, caller_id
  from unnest(coalesce(p_permission_keys, array[]::text[])) requested(key);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, caller_id, 'user.precreated', 'membership', v_membership_id::text,
    jsonb_build_object(
      'email', lower(trim(p_email)), 'display_name', trim(p_display_name),
      'role', p_role, 'job_title', trim(p_job_title),
      'department_ids', coalesce(p_department_ids, array[]::uuid[]),
      'permission_keys', coalesce(p_permission_keys, array[]::text[])
    )
  );

  return v_membership_id;
end;
$$;

revoke all on function private.provision_team_member(uuid, uuid, text, text, text, text, uuid[], text[], boolean) from public, anon;
grant execute on function private.provision_team_member(uuid, uuid, text, text, text, text, uuid[], text[], boolean) to authenticated;

create or replace function public.provision_team_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_job_title text,
  p_department_ids uuid[],
  p_permission_keys text[],
  p_must_change_password boolean default true
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.provision_team_member(
    p_organization_id, p_user_id, p_email, p_display_name, p_role,
    p_job_title, p_department_ids, p_permission_keys, p_must_change_password
  );
$$;

revoke all on function public.provision_team_member(uuid, uuid, text, text, text, text, uuid[], text[], boolean) from public, anon;
grant execute on function public.provision_team_member(uuid, uuid, text, text, text, text, uuid[], text[], boolean) to authenticated;

create or replace function private.complete_first_login(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships%rowtype;
begin
  select * into v_membership
  from public.memberships
  where id = p_membership_id
    and user_id = (select auth.uid())
    and status = 'active';

  if v_membership.id is null then
    raise exception 'permission_denied';
  end if;

  update public.memberships
  set must_change_password = false,
      last_login_at = now(),
      updated_at = now()
  where id = p_membership_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    v_membership.organization_id, (select auth.uid()), 'user.first_login_completed',
    'membership', p_membership_id::text
  );
end;
$$;

revoke all on function private.complete_first_login(uuid) from public, anon;
grant execute on function private.complete_first_login(uuid) to authenticated;

create or replace function public.complete_first_login(p_membership_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.complete_first_login(p_membership_id); $$;

revoke all on function public.complete_first_login(uuid) from public, anon;
grant execute on function public.complete_first_login(uuid) to authenticated;

create or replace function private.record_app_event(
  p_organization_id uuid,
  p_department_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_after_data jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id bigint;
begin
  if not (select private.is_org_member(p_organization_id)) then
    raise exception 'permission_denied';
  end if;
  if p_department_id is not null
    and not (select private.can_access_department(p_organization_id, p_department_id))
  then
    raise exception 'department_access_denied';
  end if;
  if p_action !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    or p_entity_type !~ '^[a-z][a-z0-9_]*$'
    or char_length(p_action) > 100
    or char_length(p_entity_type) > 80
    or char_length(coalesce(p_entity_id, '')) > 160
  then
    raise exception 'invalid_event';
  end if;

  insert into public.audit_logs (
    organization_id, department_id, actor_user_id, action,
    entity_type, entity_id, after_data
  ) values (
    p_organization_id, p_department_id, (select auth.uid()), p_action,
    p_entity_type, p_entity_id, p_after_data
  ) returning id into v_log_id;
  return v_log_id;
end;
$$;

revoke all on function private.record_app_event(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function private.record_app_event(uuid, uuid, text, text, text, jsonb) to authenticated;

create or replace function public.record_app_event(
  p_organization_id uuid,
  p_department_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_after_data jsonb default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.record_app_event(
    p_organization_id, p_department_id, p_action, p_entity_type,
    p_entity_id, p_after_data
  );
$$;

revoke all on function public.record_app_event(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.record_app_event(uuid, uuid, text, text, text, jsonb) to authenticated;

create or replace function private.create_restaurant_workspace(
  p_name text,
  p_slug text,
  p_owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_organization_id uuid;
  v_membership_id uuid;
  v_department_id uuid;
  v_department_name text;
begin
  if not exists (select 1 from private.platform_admins where user_id = caller_id) then
    raise exception 'platform_admin_required';
  end if;
  if trim(coalesce(p_name, '')) = ''
    or char_length(trim(p_name)) > 120
    or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or not exists (select 1 from auth.users where id = p_owner_user_id)
  then
    raise exception 'invalid_restaurant';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), p_slug, caller_id)
  returning id into v_organization_id;

  insert into public.memberships (
    organization_id, user_id, role, status, created_by, job_title
  ) values (
    v_organization_id, p_owner_user_id, 'owner', 'active', caller_id, 'Owner'
  ) returning id into v_membership_id;

  foreach v_department_name in array array['Bar', 'Kitchen']
  loop
    insert into public.departments (organization_id, name, slug, created_by)
    values (v_organization_id, v_department_name, lower(v_department_name), caller_id)
    returning id into v_department_id;
    insert into public.membership_departments (membership_id, department_id, created_by)
    values (v_membership_id, v_department_id, caller_id);
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    v_organization_id, caller_id, 'organization.created', 'organization',
    v_organization_id::text, jsonb_build_object('name', trim(p_name), 'slug', p_slug, 'owner_user_id', p_owner_user_id)
  );
  return v_organization_id;
end;
$$;

revoke all on function private.create_restaurant_workspace(text, text, uuid) from public, anon;
grant execute on function private.create_restaurant_workspace(text, text, uuid) to authenticated;

create or replace function public.create_restaurant_workspace(
  p_name text,
  p_slug text,
  p_owner_user_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_restaurant_workspace(p_name, p_slug, p_owner_user_id); $$;

revoke all on function public.create_restaurant_workspace(text, text, uuid) from public, anon;
grant execute on function public.create_restaurant_workspace(text, text, uuid) to authenticated;

create or replace function private.set_department_primary_manager(
  p_department_id uuid,
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department public.departments%rowtype;
  v_manager public.memberships%rowtype;
begin
  select * into v_department from public.departments where id = p_department_id and archived_at is null;
  if v_department.id is null
    or not (
      (select private.has_org_role(v_department.organization_id, array['owner', 'admin']))
      or (select private.has_permission(v_department.organization_id, 'settings.departments'))
    )
  then
    raise exception 'permission_denied';
  end if;

  delete from public.department_managers where department_id = p_department_id and is_primary;
  if p_membership_id is null then return; end if;

  select * into v_manager
  from public.memberships
  where id = p_membership_id
    and organization_id = v_department.organization_id
    and status = 'active'
    and role in ('owner', 'admin', 'manager');
  if v_manager.id is null then raise exception 'invalid_manager'; end if;

  insert into public.department_managers (department_id, membership_id, is_primary, assigned_by)
  values (p_department_id, p_membership_id, true, (select auth.uid()));
end;
$$;

revoke all on function private.set_department_primary_manager(uuid, uuid) from public, anon;
grant execute on function private.set_department_primary_manager(uuid, uuid) to authenticated;

create or replace function public.set_department_primary_manager(
  p_department_id uuid,
  p_membership_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_department_primary_manager(p_department_id, p_membership_id); $$;

revoke all on function public.set_department_primary_manager(uuid, uuid) from public, anon;
grant execute on function public.set_department_primary_manager(uuid, uuid) to authenticated;
