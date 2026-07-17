create or replace function public.resolve_workspace(p_identifier text)
returns table(name text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select trim(both '-' from regexp_replace(replace(lower(trim(coalesce(p_identifier, ''))), '&', ' and '), '[^a-z0-9]+', '-', 'g')) as wanted
  ), candidates as (
    select
      organization.name,
      organization.slug,
      case
        when normalized.wanted = trim(both '-' from regexp_replace(replace(lower(organization.name), '&', ' and '), '[^a-z0-9]+', '-', 'g')) then 0
        when normalized.wanted = trim(both '-' from regexp_replace(replace(lower(organization.slug), '&', ' and '), '[^a-z0-9]+', '-', 'g')) then 0
        else 1
      end as match_rank
    from public.organizations as organization
    cross join normalized
    where normalized.wanted <> ''
      and (
        normalized.wanted = trim(both '-' from regexp_replace(replace(lower(organization.name), '&', ' and '), '[^a-z0-9]+', '-', 'g'))
        or normalized.wanted = trim(both '-' from regexp_replace(replace(lower(organization.slug), '&', ' and '), '[^a-z0-9]+', '-', 'g'))
        or (
          exists (
            select 1
            from unnest(string_to_array(normalized.wanted, '-')) as word
            where char_length(word) > 2 and word not in ('the', 'restaurant')
          )
          and not exists (
            select 1
            from unnest(string_to_array(normalized.wanted, '-')) as word
            where char_length(word) > 2
              and word not in ('the', 'restaurant')
              and word <> all(string_to_array(
                trim(both '-' from regexp_replace(replace(lower(organization.name || '-' || organization.slug), '&', ' and '), '[^a-z0-9]+', '-', 'g')),
                '-'
              ))
          )
        )
      )
  ), unambiguous as (
    select count(*) as match_count from candidates
  )
  select candidates.name, candidates.slug
  from candidates
  cross join unambiguous
  where unambiguous.match_count = 1
  order by candidates.match_rank
  limit 1;
$$;

comment on function public.resolve_workspace(text) is
  'Returns only the canonical name and slug for one unambiguous workspace match so the public login screen can reject unknown identifiers.';

revoke all on function public.resolve_workspace(text) from public;
grant execute on function public.resolve_workspace(text) to anon, authenticated;

create or replace function public.get_my_workspace_membership(p_identifier text)
returns table(
  id uuid,
  must_change_password boolean,
  status text,
  organization_name text,
  organization_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    membership.id,
    membership.must_change_password,
    membership.status,
    organization.name,
    organization.slug
  from public.resolve_workspace(p_identifier) as resolved
  join public.organizations as organization on organization.slug = resolved.slug
  join public.memberships as membership on membership.organization_id = organization.id
  where membership.user_id = (select auth.uid())
  limit 1;
$$;

comment on function public.get_my_workspace_membership(text) is
  'Returns the signed-in user own membership state for one resolved workspace, including suspended state for a precise login error.';

revoke all on function public.get_my_workspace_membership(text) from public, anon;
grant execute on function public.get_my_workspace_membership(text) to authenticated;
