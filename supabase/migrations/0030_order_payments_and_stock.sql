-- ============================================================================
-- Système de paiements, stock et comptabilité pour les commandes
-- Connecte: Commandes → Paiements → Comptabilité → Stock
-- ============================================================================

-- 1. Ajouter le solde/balance aux clients
alter table public.contacts add column if not exists balance numeric(12,2) default 0;
comment on column public.contacts.balance is 'Solde du client: positif = doit payer, négatif = crédit';

-- 2. Ajouter les champs de paiement aux commandes de production
alter table public.pipeline_orders add column if not exists order_total numeric(12,2);
alter table public.pipeline_orders add column if not exists initial_payment numeric(12,2) default 0;
alter table public.pipeline_orders add column if not exists payment_status text default 'unpaid'; -- unpaid, partial, paid
alter table public.pipeline_orders add column if not exists notes text;

comment on column public.pipeline_orders.order_total is 'Total TTC de la commande';
comment on column public.pipeline_orders.initial_payment is 'Versement à la création de la commande';
comment on column public.pipeline_orders.payment_status is 'État du paiement: unpaid, partial, paid';

-- 3. Table: Paiements des commandes (lié à la comptabilité)
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text not null, -- 'cash', 'transfer', 'card', 'check', 'yalidine', 'other'
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_payments_order_idx on public.order_payments(pipeline_order_id);
create index order_payments_created_idx on public.order_payments(created_at);

-- 4. Table: Sorties de stock (quand on livre)
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  pipeline_order_id uuid references public.pipeline_orders(id) on delete set null,
  quantity integer not null,
  movement_type text not null, -- 'out' (vente/livraison), 'in' (retour/réception), 'adjustment'
  reason text, -- 'delivery', 'return', 'damage', 'waste', 'adjustment'
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements(product_id);
create index inventory_movements_order_idx on public.inventory_movements(pipeline_order_id);

-- 5. Fonction: Mettre à jour le solde client quand on enregistre un paiement
create or replace function public.update_client_balance_on_payment()
returns trigger language plpgsql as $$
declare
  v_contact_id uuid;
  v_total_paid numeric;
  v_order_total numeric;
begin
  -- Récupérer l'ID du client et le total de la commande
  select contact_id, order_total into v_contact_id, v_order_total
  from public.pipeline_orders
  where id = new.pipeline_order_id;

  if v_contact_id is null then
    return new;
  end if;

  -- Calculer le total payé (tous les paiements pour cette commande)
  select coalesce(sum(amount), 0) into v_total_paid
  from public.order_payments
  where pipeline_order_id = new.pipeline_order_id;

  -- Mettre à jour le solde: balance = total_commande - total_payé
  -- Si positive = client doit payer, si négative = crédit client
  update public.contacts
  set balance = coalesce(v_order_total, 0) - v_total_paid
  where id = v_contact_id;

  return new;
end $$;

-- 6. Trigger: Mettre à jour le solde après un paiement
drop trigger if exists update_client_balance_on_payment_trigger on public.order_payments;
create trigger update_client_balance_on_payment_trigger
after insert or update on public.order_payments
for each row execute function public.update_client_balance_on_payment();

-- 7. Fonction: Créer une écriture comptable quand on paie une commande
create or replace function public.post_order_payment_journal()
returns trigger language plpgsql as $$
declare
  v_order_number text;
  v_contact_name text;
begin
  select po.number, c.name into v_order_number, v_contact_name
  from public.pipeline_orders po
  join public.contacts c on po.contact_id = c.id
  where po.id = new.pipeline_order_id;

  if v_order_number is not null then
    insert into public.journal_entries (
      entry_date,
      reference,
      description,
      source_type,
      source_id,
      created_by
    ) values (
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

-- 8. Trigger: Enregistrer la comptabilité
drop trigger if exists post_order_payment_journal_trigger on public.order_payments;
create trigger post_order_payment_journal_trigger
after insert on public.order_payments
for each row execute function public.post_order_payment_journal();

-- 9. Fonction: Sortir du stock quand on livre
create or replace function public.inventory_out_on_delivery()
returns trigger language plpgsql as $$
declare
  v_item record;
begin
  -- Si la commande passe à "livrée", sortir tous les articles du stock
  if new.stage = 'livre' and old.stage != 'livre' then
    for v_item in
      select product_name, quantity from public.pipeline_order_items
      where pipeline_order_id = new.id
    loop
      -- Chercher le produit correspondant
      insert into public.inventory_movements (
        product_id,
        pipeline_order_id,
        quantity,
        movement_type,
        reason,
        recorded_by,
        created_at
      )
      select
        p.id,
        new.id,
        v_item.quantity,
        'out',
        'delivery',
        auth.uid(),
        now()
      from public.products p
      where p.name = v_item.product_name
      limit 1;
    end loop;
  end if;

  return new;
end $$;

-- 10. Trigger: Sortir du stock à la livraison
drop trigger if exists inventory_out_on_delivery_trigger on public.pipeline_orders;
create trigger inventory_out_on_delivery_trigger
before update on public.pipeline_orders
for each row execute function public.inventory_out_on_delivery();

-- 11. RLS pour order_payments
alter table public.order_payments enable row level security;

create policy "order_payments_select" on public.order_payments for select
  to authenticated using (public.is_active_user());

create policy "order_payments_insert" on public.order_payments for insert
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager', 'sales'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager', 'sales'));

-- 12. RLS pour inventory_movements
alter table public.inventory_movements enable row level security;

create policy "inventory_movements_select" on public.inventory_movements for select
  to authenticated using (public.is_active_user());

create policy "inventory_movements_insert" on public.inventory_movements for insert
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'));
