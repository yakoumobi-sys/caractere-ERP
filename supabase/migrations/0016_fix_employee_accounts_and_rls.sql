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

-- supply_types et supply_alerts n'existent, à ce point de la chaîne, que sur la
-- base historique où elles ont été posées à la main (voir la note en fin de
-- fichier). Les durcir sans condition faisait échouer cette migration sur toute
-- base neuve. On les traite si elles sont là ; sinon 0019, qui les crée
-- désormais pour de bon, pose les mêmes policies.
do $$
declare t text;
begin
  foreach t in array array['supply_types', 'supply_alerts']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated using (public.is_active_user())',
      t
    );
    execute format('drop policy if exists "%1$s_write" on public.%1$s', t);
    execute format(
      'create policy "%1$s_write" on public.%1$s for all to authenticated '
      'using (public.is_active_user() and public.current_role() <> ''readonly'') '
      'with check (public.is_active_user() and public.current_role() <> ''readonly'')',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Sécurité : suppression de la porte dérobée de création de compte
-- ----------------------------------------------------------------------------
-- Non référencée dans le code de l'application — fonction de debug oubliée.
drop function if exists public.create_user(text, text);

-- ----------------------------------------------------------------------------
-- Note historique : supply_alerts, supply_types, production_tasks, claims
-- (schéma réel) et yalidine_* avaient été créées directement en base (SQL
-- Editor / MCP) sans migration correspondante — le dépôt ne savait donc pas
-- reconstruire la base, et la chaîne s'arrêtait ici sur tout environnement
-- neuf. supply_types et supply_alerts sont désormais créées par 0019 ; les
-- autres ont été retrouvées dans les migrations ultérieures. Un audit des
-- tables et vues lues par le code ne signale plus de manquante.
-- ============================================================================
