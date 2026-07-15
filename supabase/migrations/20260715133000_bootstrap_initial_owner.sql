create table private.initial_owner_bootstrap (
  singleton boolean primary key default true check (singleton),
  email text not null unique check (email = lower(email)),
  claimed_by uuid unique references auth.users(id) on delete restrict,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((claimed_by is null) = (claimed_at is null))
);

revoke all on table private.initial_owner_bootstrap from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
  organization_id uuid;
  membership_id uuid;
  department_id uuid;
  department_name text;
  department_slug text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''));

  update private.initial_owner_bootstrap
  set claimed_by = new.id,
      claimed_at = now()
  where singleton = true
    and claimed_by is null
    and email = lower(coalesce(new.email, ''))
  returning email into owner_email;

  if owner_email is null then
    return new;
  end if;

  insert into public.organizations (name, slug, created_by)
  values ('Keg Bar', 'keg-bar', new.id)
  returning id into organization_id;

  insert into public.memberships (organization_id, user_id, role, status, created_by)
  values (organization_id, new.id, 'owner', 'active', new.id)
  returning id into membership_id;

  foreach department_name in array array['Bar', 'Kitchen', 'Office Supplies']
  loop
    department_slug := lower(replace(department_name, ' ', '-'));

    insert into public.departments (organization_id, name, slug, created_by)
    values (organization_id, department_name, department_slug, new.id)
    returning id into department_id;

    insert into public.membership_departments (membership_id, department_id, created_by)
    values (membership_id, department_id, new.id);
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    organization_id,
    new.id,
    'organization.bootstrap',
    'organization',
    organization_id::text,
    jsonb_build_object('owner_email', owner_email, 'departments', array['Bar', 'Kitchen', 'Office Supplies'])
  );

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
