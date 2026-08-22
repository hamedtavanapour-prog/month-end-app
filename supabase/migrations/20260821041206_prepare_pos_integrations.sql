-- Provider-neutral POS integration foundation. Core Month End products, menus,
-- recipes, inventory, and usage remain owned by workspace_states.

insert into public.permission_definitions (key, area, label, description, manager_assignable)
values
  ('integrations.pos.view', 'POS integrations', 'View POS integrations', 'View POS connection status, imported menu items, mappings, and ticket summaries.', true),
  ('integrations.pos.manage', 'POS integrations', 'Manage POS integrations', 'Configure or disconnect restaurant POS integrations.', false),
  ('integrations.pos.map', 'POS integrations', 'Map POS menu items', 'Map imported POS items to Month End menu items and recipe variants.', true),
  ('integrations.pos.sync', 'POS integrations', 'Synchronize POS data', 'Import POS menus and tickets and run reconciliation.', false),
  ('integrations.pos.errors', 'POS integrations', 'View POS integration errors', 'View synchronization failures and retained integration events.', false)
on conflict (key) do update set
  area = excluded.area,
  label = excluded.label,
  description = excluded.description,
  manager_assignable = excluded.manager_assignable;

create table public.pos_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  integration_type text not null default 'read_only'
    check (integration_type in ('historical_read_only', 'current_day_read_only', 'read_only')),
  mode text not null default 'mock' check (mode in ('mock', 'live')),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'test_mode', 'connected', 'paused', 'error', 'disconnected')),
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object')
    check (not (configuration ?| array['api_key', 'apiKey', 'secret', 'token', 'password'])),
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  sync_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider),
  unique (id, organization_id)
);

create table public.pos_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null,
  external_location_id text not null check (char_length(trim(external_location_id)) between 1 and 200),
  name text not null check (char_length(trim(name)) between 1 and 200),
  timezone text,
  status text not null default 'active' check (status in ('active', 'inactive', 'error')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade,
  unique (integration_id, external_location_id),
  unique (id, organization_id)
);

create table public.pos_menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null,
  location_id uuid not null,
  external_item_id text not null check (char_length(trim(external_item_id)) between 1 and 240),
  name text not null check (char_length(trim(name)) between 1 and 300),
  category text,
  sku text,
  price numeric(14, 4),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.pos_locations(id, organization_id) on delete cascade,
  unique (location_id, external_item_id),
  unique (id, organization_id)
);

create table public.pos_item_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null,
  pos_menu_item_id uuid not null,
  external_item_id text not null,
  external_item_name text not null,
  month_end_menu_item_id text,
  month_end_menu_item_name text,
  month_end_menu_variant_key text,
  month_end_menu_variant_name text,
  mapping_status text not null default 'unmapped'
    check (mapping_status in ('unmapped', 'mapped', 'ignored', 'needs_review')),
  mapped_by uuid references auth.users(id) on delete set null,
  mapped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade,
  foreign key (pos_menu_item_id, organization_id)
    references public.pos_menu_items(id, organization_id) on delete cascade,
  unique (pos_menu_item_id),
  constraint pos_item_mappings_mapped_target check (
    mapping_status <> 'mapped'
    or (month_end_menu_item_id is not null and month_end_menu_variant_key is not null)
  )
);

create table public.pos_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null,
  location_id uuid not null,
  external_ticket_id text not null check (char_length(trim(external_ticket_id)) between 1 and 240),
  ticket_number text,
  status text not null,
  opened_at timestamptz,
  closed_at timestamptz,
  source_updated_at timestamptz,
  external_employee_id text,
  employee_name text,
  guest_count integer check (guest_count is null or guest_count >= 0),
  subtotal numeric(14, 4),
  total numeric(14, 4),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  content_hash text not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.pos_locations(id, organization_id) on delete cascade,
  unique (location_id, external_ticket_id),
  unique (id, organization_id)
);

create table public.pos_ticket_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null,
  ticket_id uuid not null,
  pos_menu_item_id uuid,
  external_ticket_item_id text not null check (char_length(trim(external_ticket_item_id)) between 1 and 240),
  external_menu_item_id text,
  name text not null check (char_length(trim(name)) between 1 and 300),
  quantity numeric(14, 4) not null check (quantity >= 0),
  unit_price numeric(14, 4),
  total numeric(14, 4),
  is_voided boolean not null default false,
  is_cancelled boolean not null default false,
  modifiers jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade,
  foreign key (ticket_id, organization_id)
    references public.pos_tickets(id, organization_id) on delete cascade,
  foreign key (pos_menu_item_id, organization_id)
    references public.pos_menu_items(id, organization_id) on delete set null (pos_menu_item_id),
  unique (ticket_id, external_ticket_item_id),
  unique (id, organization_id)
);

create table public.pos_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null,
  location_id uuid,
  sync_kind text not null check (sync_kind in ('connection_test', 'menu', 'tickets', 'reconciliation', 'webhook')),
  trigger_type text not null check (trigger_type in ('manual', 'scheduled', 'webhook', 'mock')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  range_start timestamptz,
  range_end timestamptz,
  records_received integer not null default 0 check (records_received >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  records_skipped integer not null default 0 check (records_skipped >= 0),
  error text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  triggered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.pos_locations(id, organization_id) on delete set null (location_id)
);

create table public.integration_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  external_id text,
  event_type text not null check (char_length(trim(event_type)) between 1 and 160),
  payload jsonb not null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  retained_until timestamptz not null default (now() + interval '90 days'),
  foreign key (integration_id, organization_id)
    references public.pos_integrations(id, organization_id) on delete cascade
);

create or replace function private.prevent_pos_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable for POS integration records'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_pos_tenant_change() from public, anon, authenticated;

create trigger pos_integrations_tenant_immutable before update on public.pos_integrations
  for each row execute function private.prevent_pos_tenant_change();
create trigger pos_locations_tenant_immutable before update on public.pos_locations
  for each row execute function private.prevent_pos_tenant_change();
create trigger pos_menu_items_tenant_immutable before update on public.pos_menu_items
  for each row execute function private.prevent_pos_tenant_change();
create trigger pos_item_mappings_tenant_immutable before update on public.pos_item_mappings
  for each row execute function private.prevent_pos_tenant_change();
create trigger pos_tickets_tenant_immutable before update on public.pos_tickets
  for each row execute function private.prevent_pos_tenant_change();
create trigger pos_ticket_items_tenant_immutable before update on public.pos_ticket_items
  for each row execute function private.prevent_pos_tenant_change();
create trigger pos_sync_runs_tenant_immutable before update on public.pos_sync_runs
  for each row execute function private.prevent_pos_tenant_change();
create trigger integration_events_tenant_immutable before update on public.integration_events
  for each row execute function private.prevent_pos_tenant_change();

create unique index integration_events_external_event_idx
  on public.integration_events(organization_id, provider, external_id, event_type)
  where external_id is not null;

create index pos_integrations_org_status_idx
  on public.pos_integrations(organization_id, status);
create index pos_locations_org_integration_idx
  on public.pos_locations(organization_id, integration_id);
create index pos_menu_items_org_location_active_idx
  on public.pos_menu_items(organization_id, location_id, is_active);
create index pos_item_mappings_org_status_idx
  on public.pos_item_mappings(organization_id, mapping_status);
create index pos_item_mappings_integration_idx
  on public.pos_item_mappings(integration_id);
create index pos_tickets_org_location_closed_idx
  on public.pos_tickets(organization_id, location_id, closed_at desc);
create index pos_tickets_integration_idx
  on public.pos_tickets(integration_id);
create index pos_ticket_items_org_ticket_idx
  on public.pos_ticket_items(organization_id, ticket_id);
create index pos_ticket_items_integration_idx
  on public.pos_ticket_items(integration_id);
create index pos_ticket_items_pos_menu_item_idx
  on public.pos_ticket_items(pos_menu_item_id) where pos_menu_item_id is not null;
create index pos_sync_runs_org_started_idx
  on public.pos_sync_runs(organization_id, started_at desc);
create index pos_sync_runs_integration_idx
  on public.pos_sync_runs(integration_id);
create index pos_sync_runs_location_idx
  on public.pos_sync_runs(location_id) where location_id is not null;
create index integration_events_org_received_idx
  on public.integration_events(organization_id, received_at desc);
create index integration_events_integration_idx
  on public.integration_events(integration_id) where integration_id is not null;
create index integration_events_pending_idx
  on public.integration_events(processing_status, received_at)
  where processing_status in ('pending', 'failed');

alter table public.pos_integrations enable row level security;
alter table public.pos_locations enable row level security;
alter table public.pos_menu_items enable row level security;
alter table public.pos_item_mappings enable row level security;
alter table public.pos_tickets enable row level security;
alter table public.pos_ticket_items enable row level security;
alter table public.pos_sync_runs enable row level security;
alter table public.integration_events enable row level security;

create policy pos_integrations_select_authorized on public.pos_integrations
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
  );
create policy pos_integrations_insert_authorized on public.pos_integrations
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.manage'))
    )
  );
create policy pos_integrations_update_authorized on public.pos_integrations
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.manage'))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  ) with check (
    organization_id is not null
    and updated_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.manage'))
      or (select private.has_permission(organization_id, 'integrations.pos.sync'))
    )
  );

create policy pos_locations_select_authorized on public.pos_locations
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
  );
create policy pos_locations_insert_authorized on public.pos_locations
  for insert to authenticated with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.manage'))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );
create policy pos_locations_update_authorized on public.pos_locations
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.manage'))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  ) with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.manage'))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );

create policy pos_menu_items_select_authorized on public.pos_menu_items
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
  );
create policy pos_menu_items_insert_authorized on public.pos_menu_items
  for insert to authenticated with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );
create policy pos_menu_items_update_authorized on public.pos_menu_items
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  ) with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );

create policy pos_item_mappings_select_authorized on public.pos_item_mappings
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
  );
create policy pos_item_mappings_insert_authorized on public.pos_item_mappings
  for insert to authenticated with check (
    mapped_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.map'))
    )
  );
create policy pos_item_mappings_update_authorized on public.pos_item_mappings
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.map'))
  ) with check (
    mapped_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.map'))
    )
  );

create policy pos_tickets_select_authorized on public.pos_tickets
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
  );
create policy pos_tickets_insert_authorized on public.pos_tickets
  for insert to authenticated with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );
create policy pos_tickets_update_authorized on public.pos_tickets
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  ) with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );

create policy pos_ticket_items_select_authorized on public.pos_ticket_items
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
  );
create policy pos_ticket_items_insert_authorized on public.pos_ticket_items
  for insert to authenticated with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );
create policy pos_ticket_items_update_authorized on public.pos_ticket_items
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  ) with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );

create policy pos_sync_runs_select_authorized on public.pos_sync_runs
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.view'))
    or (select private.has_permission(organization_id, 'integrations.pos.errors'))
  );
create policy pos_sync_runs_insert_authorized on public.pos_sync_runs
  for insert to authenticated with check (
    triggered_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.sync'))
    )
  );
create policy pos_sync_runs_update_authorized on public.pos_sync_runs
  for update to authenticated using (
    triggered_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.sync'))
    )
  ) with check (
    triggered_by = (select auth.uid())
    and (
      (select private.has_org_role(organization_id, array['owner', 'admin']))
      or (select private.has_permission(organization_id, 'integrations.pos.sync'))
    )
  );

create policy integration_events_select_authorized on public.integration_events
  for select to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.errors'))
  );
create policy integration_events_insert_authorized on public.integration_events
  for insert to authenticated with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );
create policy integration_events_update_authorized on public.integration_events
  for update to authenticated using (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  ) with check (
    (select private.has_org_role(organization_id, array['owner', 'admin']))
    or (select private.has_permission(organization_id, 'integrations.pos.sync'))
  );

revoke all on table public.pos_integrations from anon, authenticated;
revoke all on table public.pos_locations from anon, authenticated;
revoke all on table public.pos_menu_items from anon, authenticated;
revoke all on table public.pos_item_mappings from anon, authenticated;
revoke all on table public.pos_tickets from anon, authenticated;
revoke all on table public.pos_ticket_items from anon, authenticated;
revoke all on table public.pos_sync_runs from anon, authenticated;
revoke all on table public.integration_events from anon, authenticated;
revoke all on sequence public.integration_events_id_seq from anon, authenticated;

grant select, insert, update on table public.pos_integrations to authenticated;
grant select, insert, update on table public.pos_locations to authenticated;
grant select, insert, update on table public.pos_menu_items to authenticated;
grant select, insert, update on table public.pos_item_mappings to authenticated;
grant select, insert, update on table public.pos_tickets to authenticated;
grant select, insert, update on table public.pos_ticket_items to authenticated;
grant select, insert, update on table public.pos_sync_runs to authenticated;
grant select, insert, update on table public.integration_events to authenticated;
grant usage, select on sequence public.integration_events_id_seq to authenticated;
