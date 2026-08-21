-- ============================================================================
-- Caractère ERP — Suivi de production (parcours de la commande)
-- WhatsApp (réception) -> Commercial -> Atelier DTF / Broderie -> Flocage
-- -> retour Commercial -> Livré au client
-- ============================================================================

create type public.pipeline_stage as enum (
  'reception_whatsapp',
  'commercial',
  'atelier_dtf',
  'atelier_broderie',
  'flocage',
  'retour_commercial',
  'livre'
);

create table public.pipeline_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  description text,
  stage public.pipeline_stage not null default 'reception_whatsapp',
  -- dérivé automatiquement du stage : pas de désynchronisation possible
  status text generated always as (case when stage = 'livre' then 'livre' else 'en_cours' end) stored,
  assigned_to uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pipeline_orders_stage_idx on public.pipeline_orders(stage);
create index pipeline_orders_contact_idx on public.pipeline_orders(contact_id);

-- Historique des étapes : donne la traçabilité complète (qui, quand) et permet
-- de calculer "depuis quand" une commande est dans son étape courante.
create table public.pipeline_stage_log (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  stage public.pipeline_stage not null,
  employee_id uuid references public.employees(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index pipeline_stage_log_order_idx on public.pipeline_stage_log(pipeline_order_id);

create trigger set_updated_at before update on public.pipeline_orders
  for each row execute function public.set_updated_at();

create or replace function public.set_pipeline_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := public.next_document_number('CMD-P', 'pipeline_orders');
  end if;
  return new;
end;
$$;

create trigger set_pipeline_number before insert on public.pipeline_orders
  for each row execute function public.set_pipeline_number();

-- Journalise automatiquement la création et chaque changement d'étape
create or replace function public.log_pipeline_stage()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pipeline_stage_log (pipeline_order_id, stage, employee_id)
    values (new.id, new.stage, new.assigned_to);
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into public.pipeline_stage_log (pipeline_order_id, stage, employee_id)
    values (new.id, new.stage, new.assigned_to);
  end if;
  return new;
end;
$$;

create trigger log_pipeline_stage
  after insert or update on public.pipeline_orders
  for each row execute function public.log_pipeline_stage();

-- Vue pratique : commande + client + assigné + "depuis quand" dans l'étape courante
create view public.pipeline_orders_view as
select
  po.id,
  po.number,
  po.description,
  po.stage,
  po.status,
  po.contact_id,
  c.name as contact_name,
  c.phone as contact_phone,
  po.assigned_to,
  e.first_name as assignee_first_name,
  e.last_name as assignee_last_name,
  po.created_at,
  po.updated_at,
  (
    select max(l.created_at) from public.pipeline_stage_log l
    where l.pipeline_order_id = po.id and l.stage = po.stage
  ) as stage_since
from public.pipeline_orders po
left join public.contacts c on c.id = po.contact_id
left join public.employees e on e.id = po.assigned_to;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.pipeline_orders enable row level security;
alter table public.pipeline_stage_log enable row level security;

create policy "pipeline_orders_select" on public.pipeline_orders for select to authenticated
  using (public.is_active_user());
create policy "pipeline_orders_write" on public.pipeline_orders for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

create policy "pipeline_stage_log_select" on public.pipeline_stage_log for select to authenticated
  using (public.is_active_user());
create policy "pipeline_stage_log_write" on public.pipeline_stage_log for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');
