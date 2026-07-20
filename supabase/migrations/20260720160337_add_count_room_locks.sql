create table public.count_room_locks (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  count_id text not null,
  room_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  holder_name text not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (organization_id, count_id, room_id),
  constraint count_room_locks_count_id_length check (char_length(count_id) between 1 and 100),
  constraint count_room_locks_room_id_length check (char_length(room_id) between 1 and 100),
  constraint count_room_locks_holder_name_length check (char_length(holder_name) between 1 and 160)
);

create index count_room_locks_user_id_idx on public.count_room_locks(user_id);
create index count_room_locks_expires_at_idx on public.count_room_locks(expires_at);

alter table public.count_room_locks enable row level security;

create policy count_room_locks_select_authorized
  on public.count_room_locks for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    or private.has_permission(organization_id, 'counts.view')
    or private.has_permission(organization_id, 'counts.create')
  );

grant select on table public.count_room_locks to authenticated;
revoke all on table public.count_room_locks from anon;

create or replace function private.acquire_count_room_lock(
  p_organization_id uuid,
  p_count_id text,
  p_room_id text
)
returns table (
  acquired boolean,
  user_id uuid,
  holder_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_name text;
  lock_row public.count_room_locks%rowtype;
begin
  if caller_id is null
    or not (
      private.has_org_role(p_organization_id, array['owner', 'admin'])
      or private.has_permission(p_organization_id, 'counts.create')
    )
  then
    raise exception 'permission_denied';
  end if;

  if char_length(trim(coalesce(p_count_id, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_room_id, ''))) not between 1 and 100
    or not exists (
      select 1
      from public.workspace_states ws,
        jsonb_array_elements(coalesce(ws.data -> 'inventories', '[]'::jsonb)) inventory,
        jsonb_array_elements(coalesce(inventory -> 'rooms', '[]'::jsonb)) room
      where ws.organization_id = p_organization_id
        and inventory ->> 'id' = trim(p_count_id)
        and room ->> 'id' = trim(p_room_id)
    )
  then
    raise exception 'count_room_not_found';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.email), ''), 'Team member')
  into caller_name
  from public.profiles p
  where p.id = caller_id;
  caller_name := coalesce(caller_name, 'Team member');

  insert into public.count_room_locks (
    organization_id, count_id, room_id, user_id, holder_name,
    acquired_at, heartbeat_at, expires_at
  ) values (
    p_organization_id, trim(p_count_id), trim(p_room_id), caller_id, caller_name,
    now(), now(), now() + interval '2 minutes'
  )
  on conflict (organization_id, count_id, room_id) do update
  set user_id = caller_id,
      holder_name = caller_name,
      acquired_at = case
        when public.count_room_locks.user_id = caller_id then public.count_room_locks.acquired_at
        else now()
      end,
      heartbeat_at = now(),
      expires_at = now() + interval '2 minutes'
  where public.count_room_locks.user_id = caller_id
     or public.count_room_locks.expires_at <= now()
  returning public.count_room_locks.* into lock_row;

  if lock_row.user_id is null then
    select * into lock_row
    from public.count_room_locks existing
    where existing.organization_id = p_organization_id
      and existing.count_id = trim(p_count_id)
      and existing.room_id = trim(p_room_id);
  end if;

  return query select
    lock_row.user_id = caller_id,
    lock_row.user_id,
    lock_row.holder_name,
    lock_row.expires_at;
end;
$$;

create or replace function private.release_count_room_lock(
  p_organization_id uuid,
  p_count_id text,
  p_room_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  removed_count integer;
begin
  if caller_id is null or not private.is_org_member(p_organization_id) then
    raise exception 'permission_denied';
  end if;

  delete from public.count_room_locks
  where organization_id = p_organization_id
    and count_id = trim(p_count_id)
    and room_id = trim(p_room_id)
    and user_id = caller_id;
  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;

revoke all on function private.acquire_count_room_lock(uuid, text, text) from public, anon;
revoke all on function private.release_count_room_lock(uuid, text, text) from public, anon;
grant execute on function private.acquire_count_room_lock(uuid, text, text) to authenticated;
grant execute on function private.release_count_room_lock(uuid, text, text) to authenticated;

create or replace function public.acquire_count_room_lock(
  p_organization_id uuid,
  p_count_id text,
  p_room_id text
)
returns table (
  acquired boolean,
  user_id uuid,
  holder_name text,
  expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.acquire_count_room_lock(p_organization_id, p_count_id, p_room_id);
$$;

create or replace function public.release_count_room_lock(
  p_organization_id uuid,
  p_count_id text,
  p_room_id text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.release_count_room_lock(p_organization_id, p_count_id, p_room_id);
$$;

revoke all on function public.acquire_count_room_lock(uuid, text, text) from public, anon;
revoke all on function public.release_count_room_lock(uuid, text, text) from public, anon;
grant execute on function public.acquire_count_room_lock(uuid, text, text) to authenticated;
grant execute on function public.release_count_room_lock(uuid, text, text) to authenticated;
