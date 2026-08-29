begin;

select plan(20);

select has_table('public', 'regions', 'regions are modeled explicitly');
select has_table('public', 'locations', 'restaurant locations are modeled explicitly');
select has_table('public', 'positions', 'custom positions are modeled explicitly');
select has_table('public', 'position_departments', 'positions can define default departments');
select has_table('public', 'membership_reporting_lines', 'reporting lines are modeled explicitly');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.regions'::regclass),
  'regions enforce row-level security'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.positions'::regclass),
  'positions enforce row-level security'
);

select ok(
  not has_table_privilege('authenticated', 'public.platform_administrators', 'select'),
  'platform administrator records are not exposed to restaurant users'
);

insert into auth.users (id, email)
values
  ('11000000-0000-0000-0000-000000000001', 'owner@north.example.test'),
  ('11000000-0000-0000-0000-000000000002', 'staff@north.example.test'),
  ('11000000-0000-0000-0000-000000000003', 'owner@other.example.test');

insert into public.organizations (id, name, slug, created_by)
values
  ('21000000-0000-0000-0000-000000000001', 'The Keg', 'the-keg', '11000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000002', 'Other Restaurant', 'other-restaurant', '11000000-0000-0000-0000-000000000003');

insert into public.memberships (id, organization_id, user_id, role, status)
values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'staff', 'active'),
  ('31000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000003', 'owner', 'active');

insert into public.regions (id, organization_id, name, slug, created_by)
values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Toronto', 'toronto', '11000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Other Region', 'other-region', '11000000-0000-0000-0000-000000000003');

insert into public.locations (id, organization_id, region_id, name, slug, created_by)
values
  ('51000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'North York', 'north-york', '11000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Other Location', 'other-location', '11000000-0000-0000-0000-000000000003');

insert into public.positions (id, organization_id, location_id, name, slug, can_manage_people, created_by)
values
  ('61000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Bar Manager', 'bar-manager', true, '11000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'Manager', 'manager', true, '11000000-0000-0000-0000-000000000003');

insert into public.position_permissions (position_id, permission_key, allowed, created_by)
values
  ('61000000-0000-0000-0000-000000000001', 'dashboard.view', true, '11000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000001', 'products.view', true, '11000000-0000-0000-0000-000000000001');

insert into public.membership_positions (membership_id, organization_id, position_id, location_id, is_primary, assigned_by)
values (
  '31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', true,
  '11000000-0000-0000-0000-000000000001'
);

insert into public.membership_permissions (membership_id, permission_key, allowed, granted_by)
values ('31000000-0000-0000-0000-000000000002', 'products.view', false, '11000000-0000-0000-0000-000000000001');

select has_function('public', 'get_my_effective_access', array['uuid'], 'effective access has one central read API');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer from public.regions),
  1,
  'staff see regions only within their customer organization'
);

select is(
  (select count(*)::integer from public.locations),
  1,
  'staff see locations only within their customer organization'
);

select is(
  (select count(*)::integer from public.positions),
  1,
  'staff see positions only within their customer organization'
);

select ok(
  exists (
    select 1
    from public.get_my_effective_access('21000000-0000-0000-0000-000000000001') access,
      unnest(access.permission_keys) permission_key
    where permission_key = 'dashboard.view'
  ),
  'position permissions are inherited by assigned members'
);

select ok(
  not exists (
    select 1
    from public.get_my_effective_access('21000000-0000-0000-0000-000000000001') access,
      unnest(access.permission_keys) permission_key
    where permission_key = 'products.view'
  ),
  'an explicit member denial overrides an inherited position permission'
);

select throws_ok(
  $$
    insert into public.regions (organization_id, name, slug, created_by)
    values (
      '21000000-0000-0000-0000-000000000001',
      'Unauthorized Region',
      'unauthorized-region',
      '11000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "regions"',
  'staff cannot create organization structure'
);

select throws_ok(
  $$
    select public.create_position(
      '21000000-0000-0000-0000-000000000001', 'Unauthorized Position', '', null,
      '51000000-0000-0000-0000-000000000001', false, array[]::uuid[], null, array[]::text[]
    )
  $$,
  'P0001',
  'permission_denied',
  'staff cannot create a position template'
);

set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$
    insert into public.positions (organization_id, location_id, name, slug, created_by)
    values (
      '21000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      'Inventory Coordinator',
      'inventory-coordinator',
      '11000000-0000-0000-0000-000000000001'
    )
  $$,
  'organization owners can create position templates'
);

select lives_ok(
  $$
    select public.create_position(
      '21000000-0000-0000-0000-000000000001', 'Location Coordinator', '', null,
      '51000000-0000-0000-0000-000000000001', true,
      array[]::uuid[], null, array['dashboard.view']
    )
  $$,
  'owners can create a scoped reusable position through the access API'
);

select throws_ok(
  $$
    select public.set_member_structure(
      '31000000-0000-0000-0000-000000000003', array[]::uuid[], null,
      array[]::uuid[], null, array[]::uuid[], null, null
    )
  $$,
  'P0001',
  'permission_denied',
  'an owner cannot update a member in another customer organization'
);

reset role;
update public.organizations
set slug = 'keg-bar'
where id = '21000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select private.seed_existing_keg_people_structure() $$,
  'the existing Keg workspace conversion runs safely against populated customer data'
);

select * from finish();
rollback;
