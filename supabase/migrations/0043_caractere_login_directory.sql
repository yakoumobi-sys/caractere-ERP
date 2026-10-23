-- The login screen needs names before authentication, never full HR records.
-- Historical deployments had a manually created employees_public_select policy.
create or replace function public.get_login_users()
returns table(id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select e.id, btrim(e.first_name || ' ' || coalesce(e.last_name,''))
  from public.employees e
  join public.profiles p on p.id=e.profile_id
  where e.status='actif' and p.is_active
  order by e.first_name, e.last_name
$$;
revoke all on function public.get_login_users() from public;
grant execute on function public.get_login_users() to anon, authenticated;

-- Remove the legacy broad anonymous access; login now uses the minimal RPC.
drop policy if exists employees_public_select on public.employees;
