create or replace function public.get_invitation_details(p_token_hash text)
returns table (
  organization_name text,
  email text,
  display_name text,
  role text,
  expires_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    i.email,
    i.display_name,
    i.role,
    i.expires_at,
    case
      when i.status = 'pending' and i.expires_at <= now() then 'expired'
      else i.status
    end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where char_length(p_token_hash) = 64
    and i.token_hash = p_token_hash
  limit 1;
$$;

revoke all on function public.get_invitation_details(text) from public;
grant execute on function public.get_invitation_details(text) to anon, authenticated;
