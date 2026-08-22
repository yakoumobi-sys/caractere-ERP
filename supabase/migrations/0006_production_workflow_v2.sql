-- ============================================================================
-- Caractère ERP — refonte du parcours de production
-- Le commercial configure la commande (articles, personnalisation, technique)
-- qui part ensuite dans la file de l'atelier concerné, avec un statut précis
-- à chaque étape. Ajoute aussi les comptes employés (liés à un profil) et le
-- suivi qualité (fautes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Comptes employés : un employé peut être lié à un compte de connexion
-- ----------------------------------------------------------------------------
alter table public.employees add column if not exists profile_id uuid references public.profiles(id) on delete set null;
create index if not exists employees_profile_idx on public.employees(profile_id);

alter type public.user_role add value if not exists 'atelier';

-- ----------------------------------------------------------------------------
-- 2. pipeline_orders : nouveaux champs + statut texte (remplace l'enum stage)
-- ----------------------------------------------------------------------------
drop view if exists public.pipeline_orders_view;
drop trigger if exists log_pipeline_stage on public.pipeline_orders;
drop function if exists public.log_pipeline_stage();

alter table public.pipeline_orders add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.pipeline_orders add column if not exists technique text
  check (technique in ('dtf','broderie','simple'));

alter table public.pipeline_orders add column if not exists logo_placement text;
alter table public.pipeline_orders add column if not exists logo_placement_note text;
alter table public.pipeline_orders add column if not exists logo_source text
  check (logo_source in ('whatsapp','viber','email'));
alter table public.pipeline_orders add column if not exists logo_source_value text;

-- la colonne "status" existait déjà en colonne générée (en_cours/livre) à partir
-- de l'ancien enum "stage" : on la remplace par un vrai statut détaillé.
alter table public.pipeline_orders drop column if exists status;
alter table public.pipeline_orders add column status text;

update public.pipeline_orders set status = case stage
  when 'atelier_dtf' then 'attente_dtf'
  when 'atelier_broderie' then 'attente_broderie'
  when 'flocage' then 'en_flocage'
  when 'retour_commercial' then 'prete'
  when 'livre' then 'livree'
  else 'attente_dtf' -- reception_whatsapp / commercial : pas encore de technique connue, valeur par défaut
end
where status is null;

update public.pipeline_orders set technique = 'dtf' where technique is null and stage = 'atelier_dtf';
update public.pipeline_orders set technique = 'broderie' where technique is null and stage = 'atelier_broderie';
update public.pipeline_orders set technique = 'dtf' where technique is null and stage = 'flocage';

alter table public.pipeline_orders alter column status set not null;
alter table public.pipeline_orders add constraint pipeline_orders_status_check check (status in (
  'attente_dtf','impression_dtf','attente_flocage','en_flocage',
  'attente_broderie','en_broderie',
  'attente_simple','en_simple',
  'prete','livree'
));

alter table public.pipeline_orders drop column if exists stage;

create index if not exists pipeline_orders_status_idx on public.pipeline_orders(status);
create index if not exists pipeline_orders_technique_idx on public.pipeline_orders(technique);

-- ----------------------------------------------------------------------------
-- 3. Historique : idem, remplace stage (enum) par status (texte)
-- ----------------------------------------------------------------------------
alter table public.pipeline_stage_log add column if not exists status text;
update public.pipeline_stage_log set status = stage::text where status is null;
alter table public.pipeline_stage_log alter column status set not null;
alter table public.pipeline_stage_log drop column if exists stage;

-- plus aucune colonne ne référence l'ancien type, on peut le supprimer
drop type if exists public.pipeline_stage;

create or replace function public.log_pipeline_stage()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pipeline_stage_log (pipeline_order_id, status, employee_id)
    values (new.id, new.status, new.assigned_to);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.pipeline_stage_log (pipeline_order_id, status, employee_id)
    values (new.id, new.status, new.assigned_to);
  end if;
  return new;
end;
$$;

create trigger log_pipeline_stage
  after insert or update on public.pipeline_orders
  for each row execute function public.log_pipeline_stage();

create view public.pipeline_orders_view as
select
  po.id,
  po.number,
  po.description,
  po.technique,
  po.status,
  po.logo_placement,
  po.logo_placement_note,
  po.logo_source,
  po.logo_source_value,
  po.contact_id,
  c.name as contact_name,
  c.phone as contact_phone,
  po.assigned_to,
  e.first_name as assignee_first_name,
  e.last_name as assignee_last_name,
  po.created_by,
  po.created_at,
  po.updated_at,
  (
    select max(l.created_at) from public.pipeline_stage_log l
    where l.pipeline_order_id = po.id and l.status = po.status
  ) as status_since
from public.pipeline_orders po
left join public.contacts c on c.id = po.contact_id
left join public.employees e on e.id = po.assigned_to;

-- ----------------------------------------------------------------------------
-- 4. La technique se choisit désormais au niveau de la commande, pas par zone
--    de personnalisation : la colonne devient inutile sur les lignes.
-- ----------------------------------------------------------------------------
alter table public.pipeline_order_prints drop column if exists technique;

-- ----------------------------------------------------------------------------
-- 5. Suivi qualité : fautes attribuées à un employé
-- ----------------------------------------------------------------------------
create table public.employee_faults (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  pipeline_order_id uuid references public.pipeline_orders(id) on delete set null,
  description text not null,
  severity text not null default 'mineure' check (severity in ('mineure','majeure')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index employee_faults_employee_idx on public.employee_faults(employee_id);

alter table public.employee_faults enable row level security;
create policy "employee_faults_select" on public.employee_faults for select to authenticated
  using (public.is_active_user());
create policy "employee_faults_write" on public.employee_faults for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');
