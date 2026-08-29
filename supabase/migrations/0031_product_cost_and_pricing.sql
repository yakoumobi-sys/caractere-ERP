-- ============================================================================
-- Gestion des coûts d'achat et tarification dynamique des produits
-- ============================================================================

-- 1. Ajouter les champs de coûts à la table products
alter table public.products add column if not exists cost_price numeric(12,2);
alter table public.products add column if not exists dtf_cost_per_meter numeric(12,2) default 700;
alter table public.products add column if not exists product_base_name text; -- ex: "tshirt", "polo", "gilet", "totebag"
alter table public.products add column if not exists product_variant text; -- ex: "Djebs", "Palerme", "Col Rond"
alter table public.products add column if not exists requires_dtf boolean default true;
alter table public.products add column if not exists stock_quantity integer default 0;

comment on column public.products.cost_price is 'Coût d''achat du produit';
comment on column public.products.dtf_cost_per_meter is 'Coût DTF par mètre (100cm)';
comment on column public.products.product_base_name is 'Nom de base: tshirt, polo, gilet, totebag';
comment on column public.products.product_variant is 'Variante: Djebs, Palerme, etc';
comment on column public.products.requires_dtf is 'Le produit nécessite-t-il du DTF?';
comment on column public.products.stock_quantity is 'Quantité en stock';

-- 2. Table: Variantes de produits (taille, couleur)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null, -- S, M, L, XL, XXL
  color text not null,
  sku text unique,
  created_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants(product_id);
create index product_variants_sku_idx on public.product_variants(sku);

-- 3. Table: Tarification des variantes
create table if not exists public.variant_pricing (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  sale_price numeric(12,2) not null,
  margin_percent numeric(5,2), -- Pourcentage de marge
  margin_amount numeric(12,2), -- Montant de marge fixe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index variant_pricing_variant_idx on public.variant_pricing(product_variant_id);

-- 4. Fonction: Créer automatiquement les variantes quand on crée un produit
create or replace function public.create_product_variants()
returns trigger language plpgsql as $$
declare
  v_size text;
  v_color text;
  v_sku text;
  v_variant_id uuid;
  v_base_price numeric;
  v_cost numeric;
  v_margin numeric;
begin
  -- Ne créer que si product_base_name et product_variant sont définis
  if new.product_base_name is null or new.product_variant is null then
    return new;
  end if;

  -- Les 5 tailles standards
  foreach v_size in array array['S', 'M', 'L', 'XL', 'XXL'] loop
    -- Générer SKU
    v_sku := upper(new.product_base_name) || '-' || new.product_variant || '-' || v_size || '-' || to_char(now(), 'YYYYMMDD');

    -- Créer la variante
    insert into public.product_variants (product_id, size, color, sku)
    values (new.id, v_size, new.product_variant, v_sku)
    returning id into v_variant_id;

    -- Créer la tarification pour cette variante
    -- Base: sale_price du produit
    v_base_price := coalesce(new.sale_price, 0);
    v_cost := coalesce(new.cost_price, 0);
    v_margin := v_base_price - v_cost;

    insert into public.variant_pricing (product_variant_id, sale_price, margin_amount)
    values (v_variant_id, v_base_price, v_margin);
  end loop;

  return new;
end $$;

-- 5. Trigger: Auto-créer les variantes
drop trigger if exists create_product_variants_trigger on public.products;
create trigger create_product_variants_trigger
after insert on public.products
for each row execute function public.create_product_variants();

-- 6. Fonction: Calculer le coût DTF en fonction de la longueur
create or replace function public.calculate_dtf_cost(
  p_product_id uuid,
  p_dtf_length_cm integer
)
returns numeric as $$
declare
  v_dtf_cost_per_meter numeric;
  v_total_cost numeric;
begin
  -- Récupérer le coût DTF par mètre
  select dtf_cost_per_meter into v_dtf_cost_per_meter
  from public.products
  where id = p_product_id;

  if v_dtf_cost_per_meter is null then
    v_dtf_cost_per_meter := 700; -- Défaut: 700 DA/m
  end if;

  -- Calculer: (longueur en cm / 100) × coût par mètre
  v_total_cost := (p_dtf_length_cm::numeric / 100) * v_dtf_cost_per_meter;

  return round(v_total_cost, 2);
end $$ language plpgsql;

-- 7. Fonction: Calculer le prix final avec DTF
create or replace function public.calculate_final_price(
  p_product_id uuid,
  p_dtf_length_cm integer default 0
)
returns numeric as $$
declare
  v_base_price numeric;
  v_cost_price numeric;
  v_dtf_cost numeric;
  v_final_price numeric;
begin
  -- Récupérer prix de vente et coût
  select sale_price, cost_price into v_base_price, v_cost_price
  from public.products
  where id = p_product_id;

  v_base_price := coalesce(v_base_price, 0);
  v_cost_price := coalesce(v_cost_price, 0);

  -- Calculer coût DTF
  v_dtf_cost := public.calculate_dtf_cost(p_product_id, p_dtf_length_cm);

  -- Prix final = Prix de vente + Coût DTF
  v_final_price := v_base_price + v_dtf_cost;

  return round(v_final_price, 2);
end $$ language plpgsql;

-- 8. Données initiales: Produits de base
insert into public.products (name, product_base_name, product_variant, cost_price, sale_price, unit, tax_rate, track_inventory, is_active)
values
  ('T-shirt Djebs', 'tshirt', 'Djebs', 850, 1950, 'unité', 0, true, true),
  ('T-shirt Palerme', 'tshirt', 'Palerme', 650, 1950, 'unité', 0, true, true),
  ('Polo Personnalisé', 'polo', 'Standard', 1050, 2350, 'unité', 0, true, true),
  ('Gilet Col Rond', 'gilet', 'Col Rond', 1500, 2750, 'unité', 0, true, true),
  ('Tote Bag', 'totebag', 'Standard', 250, 950, 'unité', 0, true, true)
on conflict do nothing;

-- 9. RLS pour product_variants et variant_pricing
alter table public.product_variants enable row level security;
alter table public.variant_pricing enable row level security;

create policy "product_variants_select" on public.product_variants for select
  to authenticated using (public.is_active_user());

create policy "product_variants_write" on public.product_variants for all
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'));

create policy "variant_pricing_select" on public.variant_pricing for select
  to authenticated using (public.is_active_user());

create policy "variant_pricing_write" on public.variant_pricing for all
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager'));
