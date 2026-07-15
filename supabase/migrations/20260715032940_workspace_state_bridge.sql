create table public.workspace_states (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspace_states_updated_by_idx on public.workspace_states(updated_by);

alter table public.workspace_states enable row level security;

create policy "Members can read their organization workspace state"
  on public.workspace_states
  for select
  to authenticated
  using (private.is_org_member(organization_id));

create policy "Members can create their organization workspace state"
  on public.workspace_states
  for insert
  to authenticated
  with check (
    private.is_org_member(organization_id)
    and updated_by = (select auth.uid())
  );

create policy "Members can update their organization workspace state"
  on public.workspace_states
  for update
  to authenticated
  using (private.is_org_member(organization_id))
  with check (
    private.is_org_member(organization_id)
    and updated_by = (select auth.uid())
  );

grant select, insert, update on table public.workspace_states to authenticated;
revoke all on table public.workspace_states from anon;
