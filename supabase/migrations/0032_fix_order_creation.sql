-- ============================================================================
-- Caractère ERP — Réparation de la création de commande.
--
-- Deux défauts en base empêchaient toute création de commande. Ce script les
-- corrige, est idempotent, et peut être rejoué sans risque.
--
-- 1. calculate_flocage_cost() (migration 0029) — BLOQUANT
--    Trigger BEFORE INSERT OR UPDATE sur pipeline_orders. Sa condition
--    chaînait "and" sur flocage_machine_id (uuid), flocage_meters (numeric) et
--    client_type (enum) :
--
--      if new.requires_flocage and new.flocage_machine_id
--         and new.flocage_meters and new.client_type then
--
--    PL/pgSQL rejette cela à l'exécution avec "argument of AND must be type
--    boolean, not type uuid". Le trigger étant déclenché à CHAQUE insertion,
--    aucune commande ne pouvait être créée, quelles que soient les valeurs
--    saisies. C'est la cause de l'erreur vue par l'utilisateur.
--
-- 2. Migration 0030 jamais appliquée — les montants manquent
--    Sa policy "order_payments_insert" utilisait FOR INSERT ... USING (...),
--    interdit par Postgres ("only WITH CHECK expression allowed for INSERT").
--    La migration s'interrompait là, donc pipeline_orders.order_total n'a
--    jamais existé — d'où "column pipeline_orders.order_total does not exist"
--    sur la page Ventes, et l'échec de l'INSERT de commande qui l'envoyait.
--    Son trigger inventory_out_on_delivery visait par ailleurs new.stage,
--    colonne supprimée par la migration 0006 : toute mise à jour de commande
--    aurait échoué à son tour.
--
-- Les deux diagnostics ont été reproduits et vérifiés sur une instance
-- PostgreSQL 16 rejouant l'intégralité des migrations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger de coût de flocage : tester la présence des champs, pas les
--    additionner logiquement. C'était l'intention d'origine.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. Colonnes de paiement (contenu de la migration 0030, rendu idempotent)
-- ----------------------------------------------------------------------------
alter table public.contacts add column if not exists balance numeric(12,2) default 0;

alter table public.pipeline_orders add column if not exists order_total numeric(12,2);
alter table public.pipeline_orders add column if not exists initial_payment numeric(12,2) default 0;
alter table public.pipeline_orders add column if not exists payment_status text default 'unpaid';
alter table public.pipeline_orders add column if not exists notes text;

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text not null,
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_payments_order_idx on public.order_payments(pipeline_order_id);
create index if not exists order_payments_created_idx on public.order_payments(created_at);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  pipeline_order_id uuid references public.pipeline_orders(id) on delete set null,
  quantity integer not null,
  movement_type text not null,
  reason text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id);
create index if not exists inventory_movements_order_idx on public.inventory_movements(pipeline_order_id);

-- SECURITY DEFINER + search_path fixe, comme les autres comptabilisations
-- automatiques (migration 0021) : un commercial doit pouvoir déclencher la
-- mise à jour du solde et l'écriture au journal, tables dont l'écriture
-- directe lui est refusée par RLS.
create or replace function public.update_client_balance_on_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid;
  v_total_paid numeric;
  v_order_total numeric;
begin
  select contact_id, order_total into v_contact_id, v_order_total
  from public.pipeline_orders
  where id = new.pipeline_order_id;

  if v_contact_id is null then
    return new;
  end if;

  select coalesce(sum(amount), 0) into v_total_paid
  from public.order_payments
  where pipeline_order_id = new.pipeline_order_id;

  update public.contacts
  set balance = coalesce(v_order_total, 0) - v_total_paid
  where id = v_contact_id;

  return new;
end $$;

drop trigger if exists update_client_balance_on_payment_trigger on public.order_payments;
create trigger update_client_balance_on_payment_trigger
after insert or update on public.order_payments
for each row execute function public.update_client_balance_on_payment();

create or replace function public.post_order_payment_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_number text;
  v_contact_name text;
begin
  select po.number, c.name into v_order_number, v_contact_name
  from public.pipeline_orders po
  join public.contacts c on po.contact_id = c.id
  where po.id = new.pipeline_order_id;

  if v_order_number is not null then
    insert into public.journal_entries (entry_date, reference, description, source_type, source_id, created_by)
    values (
      new.created_at,
      'PAY-' || v_order_number,
      'Paiement: ' || v_contact_name || ' - ' || new.amount || ' DA',
      'order_payment',
      new.id,
      new.recorded_by
    );
  end if;

  return new;
end $$;

drop trigger if exists post_order_payment_journal_trigger on public.order_payments;
create trigger post_order_payment_journal_trigger
after insert on public.order_payments
for each row execute function public.post_order_payment_journal();

-- new.stage n'existe plus depuis la migration 0006 : on teste status='livree'
-- (valeur de pipeline_orders_status_check, migration 0008). AFTER plutôt que
-- BEFORE : le mouvement de stock ne s'écrit que si l'update aboutit.
create or replace function public.inventory_out_on_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item record;
begin
  if new.status = 'livree' and old.status is distinct from 'livree' then
    for v_item in
      select product_name, quantity from public.pipeline_order_items
      where pipeline_order_id = new.id
    loop
      insert into public.inventory_movements
        (product_id, pipeline_order_id, quantity, movement_type, reason, recorded_by, created_at)
      select p.id, new.id, v_item.quantity, 'out', 'delivery', auth.uid(), now()
      from public.products p
      where p.name = v_item.product_name
      limit 1;
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists inventory_out_on_delivery_trigger on public.pipeline_orders;
create trigger inventory_out_on_delivery_trigger
after update on public.pipeline_orders
for each row execute function public.inventory_out_on_delivery();

-- ----------------------------------------------------------------------------
-- 3. RLS. Une policy FOR INSERT n'accepte que WITH CHECK — le USING d'origine
--    faisait échouer la migration 0030 entière.
-- ----------------------------------------------------------------------------
alter table public.order_payments enable row level security;

drop policy if exists "order_payments_select" on public.order_payments;
create policy "order_payments_select" on public.order_payments for select
  to authenticated using (public.is_active_user());

drop policy if exists "order_payments_insert" on public.order_payments;
create policy "order_payments_insert" on public.order_payments for insert
  to authenticated
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager', 'sales'));

alter table public.inventory_movements enable row level security;

drop policy if exists "inventory_movements_select" on public.inventory_movements;
create policy "inventory_movements_select" on public.inventory_movements for select
  to authenticated using (public.is_active_user());

drop policy if exists "inventory_movements_insert" on public.inventory_movements;
create policy "inventory_movements_insert" on public.inventory_movements for insert
  to authenticated
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'));
