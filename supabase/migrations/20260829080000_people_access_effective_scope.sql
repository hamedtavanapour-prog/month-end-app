-- Centralized effective access and scoped people-management operations.

create or replace function private.effective_permission_keys(p_membership_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    select id, role
    from public.memberships
    where id = p_membership_id and status = 'active'
  ), inherited as (
    select pp.permission_key
    from public.membership_positions mp
    join public.position_permissions pp on pp.position_id = mp.position_id
    join member on member.id = mp.membership_id
    where pp.allowed
  ), explicit_allowed as (
    select permission_key
    from public.membership_permissions
    where membership_id = p_membership_id and allowed
  ), available as (
    select pd.key as permission_key
    from public.permission_definitions pd
    where exists (select 1 from member where role in ('owner', 'admin'))
    union
    select permission_key from inherited
    union
    select permission_key from explicit_allowed
  )
  select available.permission_key
  from available
  where not exists (
    select 1
    from public.membership_permissions denied
    where denied.membership_id = p_membership_id
      and denied.permission_key = available.permission_key
      and denied.allowed = false
  );
$$;

revoke all on function private.effective_permission_keys(uuid) from public, anon, authenticated;
grant execute on function private.effective_permission_keys(uuid) to authenticated;

create or replace function private.can_manage_scope(
  p_organization_id uuid,
  p_region_id uuid default null,
  p_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    where mine.organization_id = p_organization_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and (
        mine.role in ('owner', 'admin')
        or exists (
            select 1 from public.membership_region_assignments mra
            where mra.membership_id = mine.id
              and mra.region_id = coalesce(
                p_region_id,
                (select location.region_id from public.locations location where location.id = p_location_id)
              )
              and mra.is_manager
        )
        or (
          p_location_id is not null
          and exists (
            select 1 from public.membership_location_assignments mla
            where mla.membership_id = mine.id
              and mla.location_id = p_location_id
              and mla.authority = 'location_admin'
          )
        )
      )
  );
$$;

revoke all on function private.can_manage_scope(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_manage_scope(uuid, uuid, uuid) to authenticated;

create or replace function private.create_position(
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_region_id uuid,
  p_location_id uuid,
  p_can_manage_people boolean,
  p_department_ids uuid[],
  p_primary_department_id uuid,
  p_permission_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_membership_id uuid;
  position_id uuid;
  position_slug text;
begin
  if caller_id is null or trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 120 then
    raise exception 'invalid_position';
  end if;
  if p_region_id is not null and p_location_id is not null then
    raise exception 'invalid_scope';
  end if;
  if not private.can_manage_scope(p_organization_id, p_region_id, p_location_id) then
    raise exception 'permission_denied';
  end if;

  select id into caller_membership_id
  from public.memberships
  where organization_id = p_organization_id
    and user_id = caller_id
    and status = 'active';

  if exists (
    select 1
    from unnest(coalesce(p_permission_keys, array[]::text[])) requested(key)
    left join public.permission_definitions pd on pd.key = requested.key
    where pd.key is null
      or (
        not exists (
          select 1 from public.memberships mine
          where mine.id = caller_membership_id and mine.role in ('owner', 'admin')
        )
        and requested.key not in (
          select private.effective_permission_keys(caller_membership_id)
        )
      )
  ) then
    raise exception 'permission_ceiling_exceeded';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id)
    left join public.departments department
      on department.id = requested.id
      and department.organization_id = p_organization_id
      and department.archived_at is null
      and (p_location_id is null or department.location_id = p_location_id)
    where department.id is null
  ) then
    raise exception 'invalid_department';
  end if;
  if p_primary_department_id is not null
    and not (p_primary_department_id = any(coalesce(p_department_ids, array[]::uuid[]))) then
    raise exception 'invalid_primary_department';
  end if;

  position_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if position_slug = '' then raise exception 'invalid_position'; end if;

  insert into public.positions (
    organization_id, region_id, location_id, name, slug, description,
    can_manage_people, created_by
  ) values (
    p_organization_id, p_region_id, p_location_id, trim(p_name), position_slug,
    trim(coalesce(p_description, '')), coalesce(p_can_manage_people, false), caller_id
  ) returning id into position_id;

  insert into public.position_departments (position_id, department_id, is_primary, created_by)
  select position_id, requested.id, requested.id = p_primary_department_id, caller_id
  from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id);

  insert into public.position_permissions (position_id, permission_key, allowed, created_by)
  select position_id, requested.key, true, caller_id
  from unnest(coalesce(p_permission_keys, array[]::text[])) requested(key);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, caller_id, 'position.created', 'position', position_id::text,
    jsonb_build_object('name', trim(p_name), 'region_id', p_region_id,
      'location_id', p_location_id, 'department_ids', coalesce(p_department_ids, array[]::uuid[]),
      'permission_keys', coalesce(p_permission_keys, array[]::text[]))
  );

  return position_id;
exception
  when unique_violation then raise exception 'position_already_exists';
end;
$$;

revoke all on function private.create_position(uuid, text, text, uuid, uuid, boolean, uuid[], uuid, text[]) from public, anon;
grant execute on function private.create_position(uuid, text, text, uuid, uuid, boolean, uuid[], uuid, text[]) to authenticated;

create or replace function public.create_position(
  p_organization_id uuid,
  p_name text,
  p_description text default '',
  p_region_id uuid default null,
  p_location_id uuid default null,
  p_can_manage_people boolean default false,
  p_department_ids uuid[] default array[]::uuid[],
  p_primary_department_id uuid default null,
  p_permission_keys text[] default array[]::text[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_position(
    p_organization_id, p_name, p_description, p_region_id, p_location_id,
    p_can_manage_people, p_department_ids, p_primary_department_id, p_permission_keys
  );
$$;

revoke all on function public.create_position(uuid, text, text, uuid, uuid, boolean, uuid[], uuid, text[]) from public, anon;
grant execute on function public.create_position(uuid, text, text, uuid, uuid, boolean, uuid[], uuid, text[]) to authenticated;

create or replace function private.set_member_structure(
  p_membership_id uuid,
  p_location_ids uuid[],
  p_primary_location_id uuid,
  p_position_ids uuid[],
  p_primary_position_id uuid,
  p_department_ids uuid[],
  p_primary_department_id uuid,
  p_supervisor_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.memberships%rowtype;
begin
  select * into target from public.memberships where id = p_membership_id;
  if target.id is null then raise exception 'membership_not_found'; end if;
  if not private.can_manage_scope(target.organization_id, null, p_primary_location_id) then
    raise exception 'permission_denied';
  end if;
  if p_primary_location_id is not null and not (p_primary_location_id = any(coalesce(p_location_ids, array[]::uuid[]))) then
    raise exception 'invalid_primary_location';
  end if;
  if p_primary_position_id is not null and not (p_primary_position_id = any(coalesce(p_position_ids, array[]::uuid[]))) then
    raise exception 'invalid_primary_position';
  end if;
  if p_primary_department_id is not null and not (p_primary_department_id = any(coalesce(p_department_ids, array[]::uuid[]))) then
    raise exception 'invalid_primary_department';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_location_ids, array[]::uuid[])) requested(id)
    left join public.locations location on location.id = requested.id and location.organization_id = target.organization_id and location.archived_at is null
    where location.id is null or not private.can_manage_scope(target.organization_id, location.region_id, location.id)
  ) then raise exception 'location_outside_scope'; end if;
  if exists (
    select 1 from unnest(coalesce(p_position_ids, array[]::uuid[])) requested(id)
    left join public.positions position on position.id = requested.id and position.organization_id = target.organization_id and position.archived_at is null
    where position.id is null or not private.can_manage_scope(target.organization_id, position.region_id, position.location_id)
  ) then raise exception 'position_outside_scope'; end if;
  if exists (
    select 1 from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id)
    left join public.departments department on department.id = requested.id and department.organization_id = target.organization_id and department.archived_at is null
    where department.id is null
  ) then raise exception 'invalid_department'; end if;
  if p_supervisor_membership_id = p_membership_id then raise exception 'invalid_supervisor'; end if;
  if p_supervisor_membership_id is not null and not exists (
    select 1 from public.memberships supervisor
    where supervisor.id = p_supervisor_membership_id
      and supervisor.organization_id = target.organization_id
      and supervisor.status = 'active'
  ) then raise exception 'invalid_supervisor'; end if;

  delete from public.membership_location_assignments where membership_id = p_membership_id;
  insert into public.membership_location_assignments (
    membership_id, organization_id, location_id, authority, is_primary, created_by
  )
  select p_membership_id, target.organization_id, requested.id, 'member',
    requested.id = p_primary_location_id, caller_id
  from unnest(coalesce(p_location_ids, array[]::uuid[])) requested(id);

  delete from public.membership_positions where membership_id = p_membership_id;
  insert into public.membership_positions (
    membership_id, organization_id, position_id, location_id, is_primary, assigned_by
  )
  select p_membership_id, target.organization_id, position.id, position.location_id,
    position.id = p_primary_position_id, caller_id
  from unnest(coalesce(p_position_ids, array[]::uuid[])) requested(id)
  join public.positions position on position.id = requested.id;

  delete from public.membership_departments where membership_id = p_membership_id;
  insert into public.membership_departments (membership_id, department_id, is_primary, created_by)
  select p_membership_id, requested.id, requested.id = p_primary_department_id, caller_id
  from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id);

  delete from public.membership_reporting_lines where membership_id = p_membership_id and location_id is null;
  if p_supervisor_membership_id is not null then
    insert into public.membership_reporting_lines (
      organization_id, membership_id, supervisor_membership_id, created_by
    ) values (target.organization_id, p_membership_id, p_supervisor_membership_id, caller_id);
  end if;
  update public.memberships
  set reports_to_membership_id = p_supervisor_membership_id, updated_at = now()
  where id = p_membership_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target.organization_id, caller_id, 'membership.structure_updated', 'membership', p_membership_id::text,
    jsonb_build_object('location_ids', coalesce(p_location_ids, array[]::uuid[]),
      'position_ids', coalesce(p_position_ids, array[]::uuid[]),
      'department_ids', coalesce(p_department_ids, array[]::uuid[]),
      'supervisor_membership_id', p_supervisor_membership_id)
  );
end;
$$;

revoke all on function private.set_member_structure(uuid, uuid[], uuid, uuid[], uuid, uuid[], uuid, uuid) from public, anon;
grant execute on function private.set_member_structure(uuid, uuid[], uuid, uuid[], uuid, uuid[], uuid, uuid) to authenticated;

create or replace function public.set_member_structure(
  p_membership_id uuid,
  p_location_ids uuid[] default array[]::uuid[],
  p_primary_location_id uuid default null,
  p_position_ids uuid[] default array[]::uuid[],
  p_primary_position_id uuid default null,
  p_department_ids uuid[] default array[]::uuid[],
  p_primary_department_id uuid default null,
  p_supervisor_membership_id uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_member_structure(
    p_membership_id, p_location_ids, p_primary_location_id,
    p_position_ids, p_primary_position_id, p_department_ids,
    p_primary_department_id, p_supervisor_membership_id
  );
$$;

revoke all on function public.set_member_structure(uuid, uuid[], uuid, uuid[], uuid, uuid[], uuid, uuid) from public, anon;
grant execute on function public.set_member_structure(uuid, uuid[], uuid, uuid[], uuid, uuid[], uuid, uuid) to authenticated;

create or replace function public.get_my_effective_access(p_organization_id uuid)
returns table (
  membership_id uuid,
  location_ids uuid[],
  position_ids uuid[],
  department_ids uuid[],
  permission_keys text[],
  can_manage_people boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    mine.id,
    coalesce((select array_agg(mla.location_id order by mla.is_primary desc, mla.created_at) from public.membership_location_assignments mla where mla.membership_id = mine.id), array[]::uuid[]),
    coalesce((select array_agg(mp.position_id order by mp.is_primary desc, mp.assigned_at) from public.membership_positions mp where mp.membership_id = mine.id), array[]::uuid[]),
    coalesce((
      select array_agg(distinct department_id)
      from (
        select md.department_id from public.membership_departments md where md.membership_id = mine.id
        union
        select pd.department_id from public.membership_positions mp join public.position_departments pd on pd.position_id = mp.position_id where mp.membership_id = mine.id
      ) effective_departments
    ), array[]::uuid[]),
    coalesce((select array_agg(effective.key order by effective.key) from private.effective_permission_keys(mine.id) as effective(key)), array[]::text[]),
    mine.role in ('owner', 'admin') or exists (
      select 1 from public.membership_positions mp
      join public.positions position on position.id = mp.position_id
      where mp.membership_id = mine.id and position.can_manage_people
    )
  from public.memberships mine
  where mine.organization_id = p_organization_id
    and mine.user_id = (select auth.uid())
    and mine.status = 'active';
$$;

revoke all on function public.get_my_effective_access(uuid) from public, anon;
grant execute on function public.get_my_effective_access(uuid) to authenticated;

-- Managers may maintain position templates only inside their assigned scope.
drop policy positions_manage_organization_admin on public.positions;
create policy positions_manage_scoped_admin
  on public.positions for all to authenticated
  using ((select private.can_manage_scope(organization_id, region_id, location_id)))
  with check ((select private.can_manage_scope(organization_id, region_id, location_id)));

-- The pre-login workspace resolver is no longer part of sign-in. Keep the
-- function temporarily for rollback compatibility, but remove exposed access.
revoke execute on function public.resolve_workspace(text) from anon, authenticated;
revoke execute on function public.get_my_workspace_membership(text) from authenticated;
