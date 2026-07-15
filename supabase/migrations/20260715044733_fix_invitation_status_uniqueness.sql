alter table public.invitations
  drop constraint if exists invitations_organization_id_email_status_key;

create unique index if not exists invitations_one_pending_per_organization_email
  on public.invitations (organization_id, email)
  where status = 'pending';
