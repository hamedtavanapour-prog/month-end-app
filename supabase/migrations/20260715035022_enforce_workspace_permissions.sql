drop policy if exists "Members can read their organization workspace state" on public.workspace_states;
drop policy if exists "Members can create their organization workspace state" on public.workspace_states;
drop policy if exists "Members can update their organization workspace state" on public.workspace_states;

create policy "Authorized members can read workspace state"
  on public.workspace_states for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    or private.has_permission(organization_id, 'dashboard.view')
    or private.has_permission(organization_id, 'products.view')
    or private.has_permission(organization_id, 'inventory.view')
    or private.has_permission(organization_id, 'counts.view')
    or private.has_permission(organization_id, 'orders.view')
    or private.has_permission(organization_id, 'usage.view')
    or private.has_permission(organization_id, 'suppliers.view')
    or private.has_permission(organization_id, 'reports.view')
  );

create policy "Authorized members can create workspace state"
  on public.workspace_states for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and (
      private.has_org_role(organization_id, array['owner', 'admin'])
      or private.has_permission(organization_id, 'products.manage')
      or private.has_permission(organization_id, 'inventory.manage')
      or private.has_permission(organization_id, 'counts.create')
      or private.has_permission(organization_id, 'counts.finish')
      or private.has_permission(organization_id, 'orders.manage')
      or private.has_permission(organization_id, 'usage.upload')
      or private.has_permission(organization_id, 'usage.manage')
      or private.has_permission(organization_id, 'suppliers.manage')
      or private.has_permission(organization_id, 'settings.rooms')
    )
  );

create policy "Authorized members can update workspace state"
  on public.workspace_states for update to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    or private.has_permission(organization_id, 'products.manage')
    or private.has_permission(organization_id, 'inventory.manage')
    or private.has_permission(organization_id, 'counts.create')
    or private.has_permission(organization_id, 'counts.finish')
    or private.has_permission(organization_id, 'orders.manage')
    or private.has_permission(organization_id, 'usage.upload')
    or private.has_permission(organization_id, 'usage.manage')
    or private.has_permission(organization_id, 'suppliers.manage')
    or private.has_permission(organization_id, 'settings.rooms')
  )
  with check (
    updated_by = (select auth.uid())
    and (
      private.has_org_role(organization_id, array['owner', 'admin'])
      or private.has_permission(organization_id, 'products.manage')
      or private.has_permission(organization_id, 'inventory.manage')
      or private.has_permission(organization_id, 'counts.create')
      or private.has_permission(organization_id, 'counts.finish')
      or private.has_permission(organization_id, 'orders.manage')
      or private.has_permission(organization_id, 'usage.upload')
      or private.has_permission(organization_id, 'usage.manage')
      or private.has_permission(organization_id, 'suppliers.manage')
      or private.has_permission(organization_id, 'settings.rooms')
    )
  );

create or replace function private.record_workspace_save(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not private.is_org_member(p_organization_id) then
    raise exception 'permission_denied';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, caller_id, 'workspace.saved', 'workspace_state',
    p_organization_id::text, jsonb_build_object('saved_at', now())
  );
end;
$$;

revoke all on function private.record_workspace_save(uuid) from public, anon;
grant execute on function private.record_workspace_save(uuid) to authenticated;

create or replace function public.record_workspace_save(p_organization_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.record_workspace_save(p_organization_id); $$;

revoke all on function public.record_workspace_save(uuid) from public, anon;
grant execute on function public.record_workspace_save(uuid) to authenticated;
