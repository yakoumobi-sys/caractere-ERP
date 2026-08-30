-- ============================================================================
-- Caractère ERP — Correctifs post-diagnostic (2026-08-24)
--
-- Constat : la migration 0015 (création des comptes de connexion des
-- employés) n'avait jamais réellement été appliquée sur le projet Supabase
-- de production, et une session précédente avait laissé la base dans un état
-- incohérent en tâtonnant sur le bug de connexion :
--   - 0 des 33 fiches "employees" n'était lié à un compte auth.users → seul
--     le compte admin (le propriétaire) pouvait se connecter à l'ERP.
--   - ~21 fiches employé étaient des doublons/tests (Jean Dupont, Marie
--     Martin, Admin Test, Hafid Commercial, Aymene Flocage...) créés pendant
--     le débogage, en plus des 11 vrais employés du seed.
--   - 5 tables (pipeline_comments, production_tasks, claims, supply_alerts,
--     supply_types) avaient RLS désactivée et AUCUNE policy → lisibles et
--     modifiables par n'importe qui avec la seule clé publique (anon), sans
--     connexion.
--   - Une fonction `create_user(email, password)` en SECURITY DEFINER était
--     appelable par n'importe qui via /rest/v1/rpc/create_user et créait un
--     compte complet (auth.users + profiles) sans aucun contrôle : porte
--     dérobée de création de compte à privilège complet.
--
-- Ce fichier documente les correctifs appliqués directement sur le projet
-- Supabase (ddhgzaezruccdsxhligx) le 2026-08-24. Il est écrit pour être
-- idempotent/rejouable sur un projet frais (ex: recréation depuis 0001→0016).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Comptes de connexion des employés
-- ----------------------------------------------------------------------------
-- Créer les auth.users manquants pour les employés du seed (email
-- prenom@caractere.com, mot de passe initial "123456" — à faire changer par
-- chacun). Le trigger handle_new_user() crée automatiquement le profil
-- correspondant (rôle "readonly" par défaut, à ajuster ensuite dans
-- Paramètres → Utilisateurs).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  lower(e.first_name) || '@caractere.com',
  crypt('123456', gen_salt('bf')),
  now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', e.first_name),
  now(), now()
from public.employees e
where e.first_name in ('Lilia','Lydia','Kholoud','Abderahmane','Hafid','Imene','Nesro','Manel','Ikram','Hanane','Aymen')
  and e.last_name = ''
  and not exists (
    select 1 from auth.users u where u.email = lower(e.first_name) || '@caractere.com'
  );

update public.employees e
set profile_id = u.id
from auth.users u
where u.email = lower(e.first_name) || '@caractere.com'
  and e.profile_id is null;

-- ----------------------------------------------------------------------------
-- 2. Sécurité : RLS manquante sur 5 tables exposées publiquement
-- ----------------------------------------------------------------------------
alter table public.pipeline_comments enable row level security;
drop policy if exists "pipeline_comments_select" on public.pipeline_comments;
create policy "pipeline_comments_select" on public.pipeline_comments
  for select to authenticated using (public.is_active_user());
drop policy if exists "pipeline_comments_insert" on public.pipeline_comments;
create policy "pipeline_comments_insert" on public.pipeline_comments
  for insert to authenticated with check (author_id = auth.uid() and public.is_active_user());

alter table public.production_tasks enable row level security;
drop policy if exists "production_tasks_select" on public.production_tasks;
create policy "production_tasks_select" on public.production_tasks
  for select to authenticated using (public.is_active_user());
drop policy if exists "production_tasks_write" on public.production_tasks;
create policy "production_tasks_write" on public.production_tasks
  for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

alter table public.claims enable row level security;
drop policy if exists "claims_select" on public.claims;
create policy "claims_select" on public.claims
  for select to authenticated using (public.is_active_user());
drop policy if exists "claims_write" on public.claims;
create policy "claims_write" on public.claims
  for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- supply_types et supply_alerts étaient utilisées par ce fichier, par la
-- migration 0019 et par le module Alertes de l'application, mais n'étaient
-- créées par AUCUNE migration : elles n'existaient que dans la base de
-- production, ajoutées hors migration. La base ne pouvait donc pas être
-- reconstruite à partir du dépôt. Le schéma ci-dessous reprend les colonnes
-- réellement utilisées par 0019 et par lib/actions/alert-actions.ts.
-- "if not exists" : sans effet sur une base qui les possède déjà.
create table if not exists public.supply_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text,
  created_at timestamptz not null default now()
);

create table if not exists public.supply_alerts (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  alert_type text not null default 'approvisionnement',
  department text,
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'ouverte',
  created_by uuid references public.employees(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supply_alerts_status_idx on public.supply_alerts(status);

alter table public.supply_types enable row level security;
drop policy if exists "supply_types_select" on public.supply_types;
create policy "supply_types_select" on public.supply_types
  for select to authenticated using (public.is_active_user());
drop policy if exists "supply_types_write" on public.supply_types;
create policy "supply_types_write" on public.supply_types
  for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

alter table public.supply_alerts enable row level security;
drop policy if exists "supply_alerts_select" on public.supply_alerts;
create policy "supply_alerts_select" on public.supply_alerts
  for select to authenticated using (public.is_active_user());
drop policy if exists "supply_alerts_write" on public.supply_alerts;
create policy "supply_alerts_write" on public.supply_alerts
  for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- ----------------------------------------------------------------------------
-- 3. Sécurité : suppression de la porte dérobée de création de compte
-- ----------------------------------------------------------------------------
-- Non référencée dans le code de l'application — fonction de debug oubliée.
drop function if exists public.create_user(text, text);

-- ----------------------------------------------------------------------------
-- Note : supply_alerts, supply_types, production_tasks, claims (schéma réel)
-- et yalidine_* n'existent pas dans les migrations 0001-0014 de ce repo —
-- elles ont été créées directement en base (SQL Editor / MCP) par une session
-- précédente sans migration correspondante. Le schéma vivant du projet
-- Supabase fait donc référence en cas de doute ; à terme, envisager de
-- régénérer les migrations manquantes (yalidine_shipments,
-- yalidine_tracking_history, supply_alerts, supply_types, tasks,
-- employee_tasks) pour que le repo reflète fidèlement la prod.
-- ============================================================================
