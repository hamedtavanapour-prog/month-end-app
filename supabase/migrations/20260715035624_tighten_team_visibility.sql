create or replace function private.can_view_membership(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships target
    join public.memberships mine on mine.organization_id = target.organization_id
    where target.id = p_membership_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and (
        mine.role in ('owner', 'admin')
        or target.id = mine.id
        or (mine.role = 'manager' and target.reports_to_membership_id = mine.id)
      )
  );
$$;

create or replace function private.can_view_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or exists (
      select 1 from public.memberships target
      where target.user_id = p_user_id
        and private.can_view_membership(target.id)
    );
$$;

create or replace function private.can_view_invitation(p_invitation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invitations i
    join public.memberships mine on mine.organization_id = i.organization_id
    where i.id = p_invitation_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and (mine.role in ('owner', 'admin') or (mine.role = 'manager' and i.invited_by = mine.user_id))
  );
$$;

revoke all on function private.can_view_membership(uuid) from public, anon;
revoke all on function private.can_view_user(uuid) from public, anon;
revoke all on function private.can_view_invitation(uuid) from public, anon;
grant execute on function private.can_view_membership(uuid) to authenticated;
grant execute on function private.can_view_user(uuid) to authenticated;
grant execute on function private.can_view_invitation(uuid) to authenticated;

drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_authorized_team
  on public.profiles for select to authenticated
  using (private.can_view_user(id));

drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_authorized_team
  on public.memberships for select to authenticated
  using (private.can_view_membership(id));

drop policy if exists membership_departments_select_member on public.membership_departments;
create policy membership_departments_select_authorized_team
  on public.membership_departments for select to authenticated
  using (private.can_view_membership(membership_id));

drop policy if exists membership_permissions_select_member on public.membership_permissions;
create policy membership_permissions_select_authorized_team
  on public.membership_permissions for select to authenticated
  using (private.can_view_membership(membership_id));

drop policy if exists invitations_select_admin on public.invitations;
create policy invitations_select_authorized_team
  on public.invitations for select to authenticated
  using (private.can_view_invitation(id));

drop policy if exists invitation_departments_select_admin on public.invitation_departments;
create policy invitation_departments_select_authorized_team
  on public.invitation_departments for select to authenticated
  using (private.can_view_invitation(invitation_id));

drop policy if exists invitation_permissions_select_admin on public.invitation_permissions;
create policy invitation_permissions_select_authorized_team
  on public.invitation_permissions for select to authenticated
  using (private.can_view_invitation(invitation_id));
