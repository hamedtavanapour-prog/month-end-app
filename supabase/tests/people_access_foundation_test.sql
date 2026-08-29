begin;

select plan(13);

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

select * from finish();
rollback;
