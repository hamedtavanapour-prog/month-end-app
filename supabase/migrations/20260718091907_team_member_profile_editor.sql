-- The original owner bootstrap created an Office Supplies department that is
-- not part of the current Bar/Kitchen workspace. Retire it without deleting
-- its historical membership references so the change remains recoverable.
update public.departments
set archived_at = coalesce(archived_at, now()), updated_at = now()
where slug = 'office-supplies'
  and name = 'Office Supplies'
  and archived_at is null;

create or replace function private.update_team_member_profile(
  p_membership_id uuid,
  p_display_name text,
  p_job_title text,
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
  target_user_id uuid;
  target_organization_id uuid;
  clean_display_name text := trim(coalesce(p_display_name, ''));
  clean_job_title text := trim(coalesce(p_job_title, ''));
begin
  if clean_display_name = '' or char_length(clean_display_name) > 120
    or clean_job_title = '' or char_length(clean_job_title) > 120
  then
    raise exception 'invalid_profile';
  end if;

  select membership.user_id, membership.organization_id
  into target_user_id, target_organization_id
  from public.memberships membership
  where membership.id = p_membership_id;

  if target_user_id is null then raise exception 'membership_not_found'; end if;

  -- Reuse the existing access-control function so owner/admin/manager scope,
  -- protected accounts, department scope, and permission scope stay identical.
  perform private.update_team_member(
    p_membership_id,
    p_role,
    p_status,
    coalesce(p_department_ids, array[]::uuid[]),
    coalesce(p_permission_keys, array[]::text[])
  );

  update public.profiles
  set display_name = clean_display_name, updated_at = now()
  where id = target_user_id;

  update public.memberships
  set job_title = clean_job_title, updated_at = now()
  where id = p_membership_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_organization_id,
    (select auth.uid()),
    'user.profile_updated',
    'membership',
    p_membership_id::text,
    jsonb_build_object('display_name', clean_display_name, 'job_title', clean_job_title)
  );
end;
$$;

revoke all on function private.update_team_member_profile(uuid, text, text, text, text, uuid[], text[]) from public, anon;
grant execute on function private.update_team_member_profile(uuid, text, text, text, text, uuid[], text[]) to authenticated;

create or replace function public.update_team_member_profile(
  p_membership_id uuid,
  p_display_name text,
  p_job_title text,
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
  select private.update_team_member_profile(
    p_membership_id,
    p_display_name,
    p_job_title,
    p_role,
    p_status,
    p_department_ids,
    p_permission_keys
  );
$$;

revoke all on function public.update_team_member_profile(uuid, text, text, text, text, uuid[], text[]) from public, anon;
grant execute on function public.update_team_member_profile(uuid, text, text, text, text, uuid[], text[]) to authenticated;
