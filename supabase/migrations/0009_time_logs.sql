-- ============================================================================
-- Caractère ERP — pointage (heure de début / fin de travail)
-- Une ligne par session : ouverte à la connexion, fermée à la déconnexion.
-- ============================================================================

create table public.time_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index time_logs_profile_idx on public.time_logs(profile_id);
create index time_logs_started_idx on public.time_logs(started_at);

alter table public.time_logs enable row level security;

-- Un utilisateur voit ses propres pointages ; admin/RH voient tout le monde
create policy "time_logs_select" on public.time_logs for select to authenticated
  using (public.is_active_user() and (profile_id = auth.uid() or public.current_role() in ('admin','hr')));

-- La connexion/déconnexion insère/ferme uniquement sa propre ligne
create policy "time_logs_insert" on public.time_logs for insert to authenticated
  with check (profile_id = auth.uid());

create policy "time_logs_update" on public.time_logs for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
