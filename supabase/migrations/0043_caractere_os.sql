-- Caractere OS : suivi du dirigeant, marketing et recrutement.
-- Nouvelle migration additive : ne modifie ni ventes, ni paiements, ni commandes historiques.
-- Tables exclusivement accessibles aux administrateurs actifs (RLS).
create table if not exists public.os_priorities (
  id uuid primary key default gen_random_uuid(),
  system text not null check (system in ('sales','marketing','delivery','finance','hiring')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  owner_name text not null default '' check (char_length(owner_name) <= 100),
  due_date date,
  status text not null default 'a_faire' check (status in ('a_faire','en_cours','bloque','termine')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.os_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 160),
  channel text not null check (channel in ('meta','instagram','facebook','tiktok','linkedin','email','autre')),
  status text not null default 'active' check (status in ('active','pause','terminee')),
  spend_dzd numeric(14,2) not null default 0 check (spend_dzd >= 0),
  leads integer not null default 0 check (leads >= 0),
  quotes integer not null default 0 check (quotes >= 0),
  orders integer not null default 0 check (orders >= 0),
  revenue_dzd numeric(14,2) not null default 0 check (revenue_dzd >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.os_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  position text not null check (char_length(btrim(position)) between 2 and 120),
  stage text not null default 'nouveau' check (stage in ('nouveau','entretien','test','offre','embauche','refuse')),
  next_action text check (next_action is null or char_length(next_action) <= 300),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists os_priorities_status_due_idx on public.os_priorities (status, due_date);
create index if not exists os_campaigns_status_idx on public.os_campaigns (status);
create index if not exists os_candidates_stage_idx on public.os_candidates (stage);

alter table public.os_priorities enable row level security;
alter table public.os_campaigns enable row level security;
alter table public.os_candidates enable row level security;

revoke all on public.os_priorities, public.os_campaigns, public.os_candidates from anon;
grant select, insert, update on public.os_priorities, public.os_campaigns, public.os_candidates to authenticated;

drop policy if exists os_priorities_admin_select on public.os_priorities;
drop policy if exists os_priorities_admin_insert on public.os_priorities;
drop policy if exists os_priorities_admin_update on public.os_priorities;
create policy os_priorities_admin_select on public.os_priorities for select to authenticated
  using (public.is_active_user() and public.current_role() = 'admin');
create policy os_priorities_admin_insert on public.os_priorities for insert to authenticated
  with check (public.is_active_user() and public.current_role() = 'admin' and created_by = (select auth.uid()));
create policy os_priorities_admin_update on public.os_priorities for update to authenticated
  using (public.is_active_user() and public.current_role() = 'admin')
  with check (public.is_active_user() and public.current_role() = 'admin' and created_by = (select auth.uid()));

drop policy if exists os_campaigns_admin_select on public.os_campaigns;
drop policy if exists os_campaigns_admin_insert on public.os_campaigns;
drop policy if exists os_campaigns_admin_update on public.os_campaigns;
create policy os_campaigns_admin_select on public.os_campaigns for select to authenticated
  using (public.is_active_user() and public.current_role() = 'admin');
create policy os_campaigns_admin_insert on public.os_campaigns for insert to authenticated
  with check (public.is_active_user() and public.current_role() = 'admin' and created_by = (select auth.uid()));
create policy os_campaigns_admin_update on public.os_campaigns for update to authenticated
  using (public.is_active_user() and public.current_role() = 'admin')
  with check (public.is_active_user() and public.current_role() = 'admin' and created_by = (select auth.uid()));

drop policy if exists os_candidates_admin_select on public.os_candidates;
drop policy if exists os_candidates_admin_insert on public.os_candidates;
drop policy if exists os_candidates_admin_update on public.os_candidates;
create policy os_candidates_admin_select on public.os_candidates for select to authenticated
  using (public.is_active_user() and public.current_role() = 'admin');
create policy os_candidates_admin_insert on public.os_candidates for insert to authenticated
  with check (public.is_active_user() and public.current_role() = 'admin' and created_by = (select auth.uid()));
create policy os_candidates_admin_update on public.os_candidates for update to authenticated
  using (public.is_active_user() and public.current_role() = 'admin')
  with check (public.is_active_user() and public.current_role() = 'admin' and created_by = (select auth.uid()));
