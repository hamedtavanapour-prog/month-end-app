update public.memberships m
set job_title = case
  when m.role = 'owner' then 'Owner'
  when m.role = 'admin' then 'Administrator'
  when m.role = 'manager' and lower(coalesce(p.display_name, '')) like '%bar%' then 'Bar Manager'
  when m.role = 'manager' and lower(coalesce(p.display_name, '')) like '%culinary%' then 'Culinary Manager'
  when m.role = 'manager' and lower(coalesce(p.display_name, '')) like '%dining%' then 'Dining Room Manager'
  when m.role = 'manager' then 'Manager'
  else 'Team Member'
end
from public.profiles p
where p.id = m.user_id
  and m.job_title is null;

insert into public.department_managers (
  department_id, membership_id, is_primary, assigned_by
)
select d.id, m.id, true, o.created_by
from public.departments d
join public.organizations o on o.id = d.organization_id
join public.memberships m
  on m.organization_id = d.organization_id
 and m.status = 'active'
 and m.job_title = 'Bar Manager'
where d.slug = 'bar'
  and not exists (
    select 1 from public.department_managers dm
    where dm.department_id = d.id and dm.is_primary
  )
on conflict (department_id, membership_id) do update set is_primary = true;
