alter table public.invitations
  add column display_name text,
  add constraint invitations_display_name_length
    check (display_name is null or char_length(trim(display_name)) between 2 and 120);

create or replace function private.has_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role in ('owner', 'admin')
        or exists (
          select 1
          from public.membership_permissions mp
          where mp.membership_id = m.id
            and mp.permission_key = p_permission_key
            and mp.allowed = true
        )
      )
  );
$$;

revoke all on function private.has_permission(uuid, text) from public, anon;
grant execute on function private.has_permission(uuid, text) to authenticated;

create or replace function private.invitation_details(p_token_hash text)
returns table (
  organization_name text,
  email text,
  display_name text,
  role text,
  expires_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.email, i.display_name, i.role, i.expires_at,
    case
      when i.status = 'pending' and i.expires_at <= now() then 'expired'
      else i.status
    end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = p_token_hash
  limit 1;
$$;

revoke all on function private.invitation_details(text) from public;
grant execute on function private.invitation_details(text) to anon, authenticated;

create or replace function public.get_invitation_details(p_token_hash text)
returns table (
  organization_name text,
  email text,
  display_name text,
  role text,
  expires_at timestamptz,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.invitation_details(p_token_hash);
$$;

revoke all on function public.get_invitation_details(text) from public;
grant execute on function public.get_invitation_details(text) to anon, authenticated;

create or replace function private.create_team_invitation(
  p_organization_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_token_hash text,
  p_department_ids uuid[],
  p_permission_keys text[],
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_membership public.memberships%rowtype;
  invitation_id uuid;
  department_id uuid;
  permission_key text;
begin
  if caller_id is null then
    raise exception 'authentication_required';
  end if;

  select * into caller_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = caller_id
    and status = 'active';

  if caller_membership.id is null or caller_membership.role not in ('owner', 'admin', 'manager') then
    raise exception 'permission_denied';
  end if;

  if p_role not in ('admin', 'manager', 'staff') then
    raise exception 'invalid_role';
  end if;

  if caller_membership.role = 'manager' and p_role <> 'staff' then
    raise exception 'managers_can_only_invite_staff';
  end if;

  if caller_membership.role = 'admin' and p_role = 'admin' then
    raise exception 'only_owner_can_invite_admin';
  end if;

  if trim(coalesce(p_display_name, '')) = ''
    or char_length(trim(p_display_name)) > 120
    or lower(trim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(p_token_hash) < 32
    or p_expires_at <= now()
  then
    raise exception 'invalid_invitation';
  end if;

  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
      and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'already_a_member';
  end if;

  update public.invitations
  set status = 'revoked'
  where organization_id = p_organization_id
    and email = lower(trim(p_email))
    and status = 'pending';

  if coalesce(array_length(p_department_ids, 1), 0) > 0 then
    if exists (
      select 1
      from unnest(p_department_ids) requested(id)
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
      from unnest(p_department_ids) requested(id)
      where not exists (
        select 1 from public.membership_departments md
        where md.membership_id = caller_membership.id
          and md.department_id = requested.id
      )
    ) then
      raise exception 'department_outside_manager_scope';
    end if;
  end if;

  if coalesce(array_length(p_permission_keys, 1), 0) > 0 and exists (
    select 1
    from unnest(p_permission_keys) requested(key)
    left join public.permission_definitions pd on pd.key = requested.key
    where pd.key is null
       or (caller_membership.role = 'manager' and pd.manager_assignable = false)
  ) then
    raise exception 'invalid_permission';
  end if;

  insert into public.invitations (
    organization_id, email, display_name, role, reports_to_membership_id,
    token_hash, status, invited_by, expires_at
  ) values (
    p_organization_id, lower(trim(p_email)), trim(p_display_name), p_role,
    case when caller_membership.role = 'manager' then caller_membership.id else null end,
    p_token_hash, 'pending', caller_id, p_expires_at
  ) returning id into invitation_id;

  foreach department_id in array coalesce(p_department_ids, array[]::uuid[])
  loop
    insert into public.invitation_departments (invitation_id, department_id)
    values (invitation_id, department_id);
  end loop;

  foreach permission_key in array coalesce(p_permission_keys, array[]::text[])
  loop
    insert into public.invitation_permissions (invitation_id, permission_key, allowed)
    values (invitation_id, permission_key, true);
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, caller_id, 'user.invited', 'invitation', invitation_id::text,
    jsonb_build_object(
      'email', lower(trim(p_email)),
      'display_name', trim(p_display_name),
      'role', p_role,
      'department_ids', coalesce(p_department_ids, array[]::uuid[]),
      'permission_keys', coalesce(p_permission_keys, array[]::text[])
    )
  );

  return invitation_id;
end;
$$;

revoke all on function private.create_team_invitation(uuid, text, text, text, text, uuid[], text[], timestamptz) from public, anon;
grant execute on function private.create_team_invitation(uuid, text, text, text, text, uuid[], text[], timestamptz) to authenticated;

create or replace function public.create_team_invitation(
  p_organization_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_token_hash text,
  p_department_ids uuid[],
  p_permission_keys text[],
  p_expires_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_team_invitation(
    p_organization_id, p_email, p_display_name, p_role, p_token_hash,
    p_department_ids, p_permission_keys, p_expires_at
  );
$$;

revoke all on function public.create_team_invitation(uuid, text, text, text, text, uuid[], text[], timestamptz) from public, anon;
grant execute on function public.create_team_invitation(uuid, text, text, text, text, uuid[], text[], timestamptz) to authenticated;

create or replace function private.accept_team_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_email text;
  invitation public.invitations%rowtype;
  v_membership_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required';
  end if;

  select lower(email) into caller_email from auth.users where id = caller_id;

  select * into invitation
  from public.invitations
  where token_hash = p_token_hash
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at <= now()
    or invitation.email <> caller_email
  then
    raise exception 'invitation_not_available';
  end if;

  insert into public.memberships (
    organization_id, user_id, role, status, reports_to_membership_id, created_by
  ) values (
    invitation.organization_id, caller_id, invitation.role, 'active',
    invitation.reports_to_membership_id, invitation.invited_by
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        reports_to_membership_id = excluded.reports_to_membership_id,
        updated_at = now()
  returning id into v_membership_id;

  delete from public.membership_departments md where md.membership_id = v_membership_id;
  insert into public.membership_departments (membership_id, department_id, created_by)
  select v_membership_id, idp.department_id, invitation.invited_by
  from public.invitation_departments idp
  where idp.invitation_id = invitation.id;

  delete from public.membership_permissions mp where mp.membership_id = v_membership_id;
  insert into public.membership_permissions (membership_id, permission_key, allowed, granted_by)
  select v_membership_id, ip.permission_key, ip.allowed, invitation.invited_by
  from public.invitation_permissions ip
  where ip.invitation_id = invitation.id;

  update public.profiles
  set display_name = coalesce(nullif(trim(display_name), ''), invitation.display_name),
      updated_at = now()
  where id = caller_id;

  update public.invitations
  set status = 'accepted', accepted_by = caller_id, accepted_at = now()
  where id = invitation.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    invitation.organization_id, caller_id, 'user.invitation_accepted',
    'membership', v_membership_id::text,
    jsonb_build_object('role', invitation.role, 'email', caller_email)
  );

  return v_membership_id;
end;
$$;

revoke all on function private.accept_team_invitation(text) from public, anon;
grant execute on function private.accept_team_invitation(text) to authenticated;

create or replace function public.accept_team_invitation(p_token_hash text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_team_invitation(p_token_hash);
$$;

revoke all on function public.accept_team_invitation(text) from public, anon;
grant execute on function public.accept_team_invitation(text) to authenticated;

create or replace function private.update_team_member(
  p_membership_id uuid,
  p_role text,
  p_status text,
  p_department_ids uuid[],
  p_permission_keys text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_membership public.memberships%rowtype;
  target_membership public.memberships%rowtype;
begin
  select * into target_membership from public.memberships where id = p_membership_id;
  select * into caller_membership
  from public.memberships
  where organization_id = target_membership.organization_id
    and user_id = caller_id
    and status = 'active';

  if caller_id is null or target_membership.id is null or caller_membership.id is null then
    raise exception 'permission_denied';
  end if;

  if p_role not in ('admin', 'manager', 'staff') or p_status not in ('active', 'suspended') then
    raise exception 'invalid_membership';
  end if;

  if target_membership.role = 'owner' or target_membership.user_id = caller_id then
    raise exception 'owner_or_self_protected';
  end if;

  if caller_membership.role = 'owner' then
    null;
  elsif caller_membership.role = 'admin' then
    if target_membership.role = 'admin' or p_role = 'admin' then
      raise exception 'only_owner_can_manage_admin';
    end if;
  elsif caller_membership.role = 'manager' then
    if target_membership.role <> 'staff'
      or target_membership.reports_to_membership_id <> caller_membership.id
      or p_role <> 'staff'
    then
      raise exception 'manager_scope_exceeded';
    end if;
  else
    raise exception 'permission_denied';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id)
    left join public.departments d
      on d.id = requested.id
     and d.organization_id = target_membership.organization_id
     and d.archived_at is null
    where d.id is null
  ) then
    raise exception 'invalid_department';
  end if;

  if caller_membership.role = 'manager' and exists (
    select 1 from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id)
    where not exists (
      select 1 from public.membership_departments md
      where md.membership_id = caller_membership.id
        and md.department_id = requested.id
    )
  ) then
    raise exception 'department_outside_manager_scope';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_permission_keys, array[]::text[])) requested(key)
    left join public.permission_definitions pd on pd.key = requested.key
    where pd.key is null
       or (caller_membership.role = 'manager' and pd.manager_assignable = false)
  ) then
    raise exception 'invalid_permission';
  end if;

  update public.memberships
  set role = p_role, status = p_status, updated_at = now()
  where id = p_membership_id;

  delete from public.membership_departments md where md.membership_id = p_membership_id;
  insert into public.membership_departments (membership_id, department_id, created_by)
  select p_membership_id, id, caller_id
  from unnest(coalesce(p_department_ids, array[]::uuid[])) requested(id);

  delete from public.membership_permissions mp where mp.membership_id = p_membership_id;
  insert into public.membership_permissions (membership_id, permission_key, allowed, granted_by)
  select p_membership_id, key, true, caller_id
  from unnest(coalesce(p_permission_keys, array[]::text[])) requested(key);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_membership.organization_id, caller_id, 'user.access_updated',
    'membership', p_membership_id::text,
    jsonb_build_object(
      'role', p_role, 'status', p_status,
      'department_ids', coalesce(p_department_ids, array[]::uuid[]),
      'permission_keys', coalesce(p_permission_keys, array[]::text[])
    )
  );
end;
$$;

revoke all on function private.update_team_member(uuid, text, text, uuid[], text[]) from public, anon;
grant execute on function private.update_team_member(uuid, text, text, uuid[], text[]) to authenticated;

create or replace function public.update_team_member(
  p_membership_id uuid,
  p_role text,
  p_status text,
  p_department_ids uuid[],
  p_permission_keys text[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_team_member(
    p_membership_id, p_role, p_status, p_department_ids, p_permission_keys
  );
$$;

revoke all on function public.update_team_member(uuid, text, text, uuid[], text[]) from public, anon;
grant execute on function public.update_team_member(uuid, text, text, uuid[], text[]) to authenticated;

create or replace function private.revoke_team_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  invitation public.invitations%rowtype;
  caller_membership public.memberships%rowtype;
begin
  select * into invitation from public.invitations where id = p_invitation_id;
  select * into caller_membership from public.memberships
  where organization_id = invitation.organization_id
    and user_id = caller_id and status = 'active';

  if invitation.id is null or caller_membership.role not in ('owner', 'admin', 'manager') then
    raise exception 'permission_denied';
  end if;

  if caller_membership.role = 'manager'
    and (invitation.role <> 'staff' or invitation.invited_by <> caller_id)
  then
    raise exception 'manager_scope_exceeded';
  end if;

  update public.invitations set status = 'revoked'
  where id = p_invitation_id and status = 'pending';

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    invitation.organization_id, caller_id, 'user.invitation_revoked',
    'invitation', p_invitation_id::text, jsonb_build_object('email', invitation.email)
  );
end;
$$;

revoke all on function private.revoke_team_invitation(uuid) from public, anon;
grant execute on function private.revoke_team_invitation(uuid) to authenticated;

create or replace function public.revoke_team_invitation(p_invitation_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.revoke_team_invitation(p_invitation_id); $$;

revoke all on function public.revoke_team_invitation(uuid) from public, anon;
grant execute on function public.revoke_team_invitation(uuid) to authenticated;

grant select on public.invitations to authenticated;
grant select on public.invitation_departments to authenticated;
grant select on public.invitation_permissions to authenticated;
