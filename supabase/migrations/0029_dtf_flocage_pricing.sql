-- ============================================================================
-- Tarification DTF + Flocage par type de client et machine
-- ============================================================================

-- Types de clients
create type public.client_type as enum ('entreprise', 'sous_traitant', 'detail');

-- Table: Machines de flocage
create table if not exists public.flocage_machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- ex: "Imene 42cm", "Nesro 60cm"
  width_cm integer not null,       -- largeur: 42cm, 60cm
  operator_name text not null,     -- "Imene", "Nesro"
  created_at timestamptz not null default now()
);
create index if not exists flocage_machines_name_idx on public.flocage_machines(name);

-- Table: Tarifs par machine et type de client
create table if not exists public.flocage_pricing (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.flocage_machines(id) on delete cascade,
  client_type public.client_type not null,
  price_per_meter numeric(12,2) not null,  -- ex: 1500 DA pour Imene entreprise
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(machine_id, client_type)
);
create index if not exists flocage_pricing_machine_idx on public.flocage_pricing(machine_id);

-- Ajouter les champs à pipeline_orders pour le flocage
alter table public.pipeline_orders add column if not exists client_type public.client_type;
alter table public.pipeline_orders add column if not exists requires_flocage boolean default false;
alter table public.pipeline_orders add column if not exists flocage_machine_id uuid references public.flocage_machines(id) on delete set null;
alter table public.pipeline_orders add column if not exists flocage_meters numeric(10,2);
alter table public.pipeline_orders add column if not exists flocage_cost numeric(12,2);

-- Ajouter les champs à pipeline_order_prints pour le flocage
alter table public.pipeline_order_prints add column if not exists flocage_meters numeric(10,2);

-- Fonction pour calculer le coût de flocage
-- Ce trigger porte sur pipeline_orders en BEFORE INSERT OR UPDATE : il
-- s'exécute donc à chaque création et à chaque modification de commande.
-- La condition chaînait "and" sur flocage_machine_id (uuid), flocage_meters
-- (numeric) et client_type (enum), ce que PL/pgSQL refuse à l'exécution
-- ("argument of AND must be type boolean") — toute création de commande
-- échouait, quelles que soient les valeurs saisies. On teste désormais la
-- présence de ces champs, ce qui était l'intention.
create or replace function public.calculate_flocage_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.requires_flocage, false)
     and new.flocage_machine_id is not null
     and new.flocage_meters is not null
     and new.client_type is not null then
    select price_per_meter * new.flocage_meters
    into new.flocage_cost
    from public.flocage_pricing
    where machine_id = new.flocage_machine_id
    and client_type = new.client_type;
  else
    new.flocage_cost = null;
  end if;
  return new;
end $$;

-- Trigger pour calculer le coût automatiquement
drop trigger if exists calculate_flocage_cost_trigger on public.pipeline_orders;
create trigger calculate_flocage_cost_trigger
before insert or update on public.pipeline_orders
for each row execute function public.calculate_flocage_cost();

-- RLS pour les nouvelles tables
alter table public.flocage_machines enable row level security;
alter table public.flocage_pricing enable row level security;

create policy "flocage_machines_select" on public.flocage_machines for select
  to authenticated using (public.is_active_user());
create policy "flocage_machines_write" on public.flocage_machines for all
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager'));

create policy "flocage_pricing_select" on public.flocage_pricing for select
  to authenticated using (public.is_active_user());
create policy "flocage_pricing_write" on public.flocage_pricing for all
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager'));

-- Données initiales: Machines de flocage
insert into public.flocage_machines (name, width_cm, operator_name) values
  ('Imene 42cm', 42, 'Imene'),
  ('Nesro 60cm', 60, 'Nesro')
on conflict do nothing;

-- Données initiales: Tarifs
insert into public.flocage_pricing (machine_id, client_type, price_per_meter)
select
  id,
  client_type,
  case
    when name = 'Imene 42cm' and client_type = 'entreprise' then 1500
    when name = 'Imene 42cm' and client_type = 'sous_traitant' then 1200
    when name = 'Imene 42cm' and client_type = 'detail' then 1800
    when name = 'Nesro 60cm' and client_type = 'entreprise' then 1800
    when name = 'Nesro 60cm' and client_type = 'sous_traitant' then 1500
    when name = 'Nesro 60cm' and client_type = 'detail' then 2200
  end as price
from public.flocage_machines,
  (values ('entreprise'::public.client_type), ('sous_traitant'::public.client_type), ('detail'::public.client_type)) as ct(client_type)
on conflict do nothing;
