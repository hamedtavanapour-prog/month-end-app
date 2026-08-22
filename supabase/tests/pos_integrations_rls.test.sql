begin;

select plan(4);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'pos-viewer@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'pos-staff@example.test');

insert into public.organizations (id, name, slug, created_by)
values
  ('20000000-0000-0000-0000-000000000001', 'POS Tenant One', 'pos-tenant-one', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'POS Tenant Two', 'pos-tenant-two', '10000000-0000-0000-0000-000000000002');

insert into public.memberships (id, organization_id, user_id, role, status)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'manager', 'active'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'staff', 'active');

insert into public.membership_permissions (membership_id, permission_key, allowed)
values ('30000000-0000-0000-0000-000000000001', 'integrations.pos.view', true);

insert into public.pos_integrations (id, organization_id, provider, mode, status, created_by, updated_by)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'omnivore', 'mock', 'test_mode', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'omnivore', 'mock', 'test_mode', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::integer from public.permission_definitions where key like 'integrations.pos.%'),
  5,
  'five explicit POS permissions are defined'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pos_integrations'::regclass),
  'POS integrations enforce row-level security'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.pos_integrations),
  1,
  'a permitted manager sees only their own restaurant integration'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer from public.pos_integrations),
  0,
  'staff without POS permission cannot view integration records'
);

select * from finish();
rollback;
