create index department_managers_assigned_by_idx
  on public.department_managers(assigned_by);

alter function public.get_invitation_details(text) security invoker;
