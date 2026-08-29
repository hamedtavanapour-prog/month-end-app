-- Keep operational position assignments and authority scopes in sync.

create or replace function private.sync_position_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_position public.positions%rowtype;
begin
  if tg_op = 'DELETE' then
    select * into assigned_position from public.positions where id = old.position_id;
    if assigned_position.slug = 'general-manager' and assigned_position.location_id is not null
      and not exists (
        select 1
        from public.membership_positions remaining
        join public.positions position on position.id = remaining.position_id
        where remaining.membership_id = old.membership_id
          and position.location_id = assigned_position.location_id
          and position.slug = 'general-manager'
      ) then
      update public.membership_location_assignments
      set authority = 'member', updated_at = now()
      where membership_id = old.membership_id
        and location_id = assigned_position.location_id;
    end if;
    if assigned_position.slug = 'regional-manager' and assigned_position.region_id is not null
      and not exists (
        select 1
        from public.membership_positions remaining
        join public.positions position on position.id = remaining.position_id
        where remaining.membership_id = old.membership_id
          and position.region_id = assigned_position.region_id
          and position.slug = 'regional-manager'
      ) then
      delete from public.membership_region_assignments
      where membership_id = old.membership_id
        and region_id = assigned_position.region_id;
    end if;
    return old;
  end if;

  select * into assigned_position from public.positions where id = new.position_id;
  if assigned_position.slug = 'general-manager' and assigned_position.location_id is not null then
    insert into public.membership_location_assignments (
      membership_id, organization_id, location_id, authority, is_primary, created_by
    ) values (
      new.membership_id, new.organization_id, assigned_position.location_id,
      'location_admin', false, new.assigned_by
    )
    on conflict (membership_id, location_id) do update
      set authority = 'location_admin', updated_at = now();
  end if;
  if assigned_position.slug = 'regional-manager' and assigned_position.region_id is not null then
    insert into public.membership_region_assignments (
      membership_id, organization_id, region_id, is_manager, created_by
    ) values (
      new.membership_id, new.organization_id, assigned_position.region_id, true, new.assigned_by
    )
    on conflict (membership_id, region_id) do update set is_manager = true;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_position_authority() from public, anon, authenticated;

create trigger membership_positions_sync_authority
after insert or delete or update of position_id on public.membership_positions
for each row execute function private.sync_position_authority();

create or replace function private.bootstrap_member_scope_from_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.memberships%rowtype;
  department public.departments%rowtype;
  matching_position public.positions%rowtype;
begin
  select * into member from public.memberships where id = new.membership_id;
  select * into department from public.departments where id = new.department_id;
  if member.id is null or department.location_id is null then return new; end if;

  insert into public.membership_location_assignments (
    membership_id, organization_id, location_id, authority, is_primary, created_by
  ) values (
    member.id, member.organization_id, department.location_id,
    case when member.role in ('owner', 'admin') then 'location_admin' else 'member' end,
    not exists (select 1 from public.membership_location_assignments where membership_id = member.id),
    new.created_by
  ) on conflict (membership_id, location_id) do nothing;

  if not exists (select 1 from public.membership_positions where membership_id = member.id) then
    select * into matching_position
    from public.positions position
    where position.organization_id = member.organization_id
      and position.location_id = department.location_id
      and position.archived_at is null
      and position.slug = case
        when lower(member.job_title) = 'culinary manager' then 'kitchen-manager'
        else trim(both '-' from regexp_replace(lower(member.job_title), '[^a-z0-9]+', '-', 'g'))
      end
    limit 1;
    if matching_position.id is not null then
      insert into public.membership_positions (
        membership_id, organization_id, position_id, location_id, is_primary, assigned_by
      ) values (
        member.id, member.organization_id, matching_position.id,
        department.location_id, true, new.created_by
      ) on conflict (membership_id, position_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.bootstrap_member_scope_from_department() from public, anon, authenticated;

create trigger membership_departments_bootstrap_scope
after insert on public.membership_departments
for each row execute function private.bootstrap_member_scope_from_department();
