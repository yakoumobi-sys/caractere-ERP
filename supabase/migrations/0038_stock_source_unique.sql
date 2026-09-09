-- ============================================================================
-- Caractère ERP — Le stock a une seule source de vérité : stock_moves
--
-- Deux systèmes de stock cohabitaient sans jamais se parler :
--
--   * stock_moves (0001), alimenté par la validation de facture et la
--     réception d'une commande fournisseur, avec des quantités signées
--     (positif = entrée, négatif = sortie) et la vue product_stock_levels ;
--   * inventory_movements (0030), alimenté par le passage d'une commande de
--     production à l'étape « livré », avec des quantités TOUJOURS positives
--     et un movement_type texte à côté.
--
-- Conséquence observée : le métier réel de l'atelier (commande → livraison)
-- n'écrivait que dans inventory_movements, une table qu'aucune page ne lit et
-- qu'aucune vue n'agrège. Les niveaux affichés ne baissaient jamais après une
-- livraison — le stock affiché était donc systématiquement surévalué.
--
-- Cette migration :
--   1. rebranche la livraison sur stock_moves, en quantité négative, via la
--      clé catalogue posée en 0035 plutôt que par correspondance de nom ;
--   2. reprend l'historique d'inventory_movements dans stock_moves ;
--   3. remplace product_stock_levels (un CROSS JOIN produits × entrepôts qui
--      fabriquait une ligne à 0 pour chaque couple sans mouvement — d'où le
--      compteur de « ruptures » du tableau de bord, qui comptait des produits
--      jamais stockés) par une agrégation des mouvements réels, et ajoute
--      product_stock_summary : une ligne par produit, avec seuil, valeur et
--      état, ce sur quoi s'appuie l'écran de gestion du stock ;
--   4. ajoute le transfert entre entrepôts, jusqu'ici sans effet : le type
--      'transfert' existait mais un seul mouvement était écrit, ce qui
--      déplaçait la quantité nulle part.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Traçabilité : d'où vient le mouvement
-- ----------------------------------------------------------------------------
alter table public.stock_moves
  add column if not exists pipeline_order_id uuid references public.pipeline_orders(id) on delete set null;

create index if not exists stock_moves_pipeline_order_idx
  on public.stock_moves(pipeline_order_id);

create index if not exists stock_moves_created_at_idx
  on public.stock_moves(created_at desc);

comment on column public.stock_moves.pipeline_order_id is
  'Commande de production à l''origine du mouvement. Sert aussi de garde-fou : une commande ne peut pas être décrémentée deux fois.';

-- ----------------------------------------------------------------------------
-- 2. Livraison d'une commande de production -> sortie de stock
--
-- L'ancienne version cherchait le produit par « p.name = v_item.product_name »
-- : un libellé saisi à la main, avec la casse et les espaces de l'opérateur.
-- 0035 a posé pipeline_order_items.product_id, on s'en sert d'abord ; la
-- correspondance par nom normalisé ne reste que pour les lignes anciennes.
--
-- AFTER UPDATE et non plus BEFORE : rien à modifier sur la ligne en cours, et
-- un échec d'insertion ne doit pas empêcher la commande de changer d'étape.
-- ----------------------------------------------------------------------------
create or replace function public.inventory_out_on_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_default_wh uuid;
  v_already int;
begin
  if new.stage is distinct from 'livre' or old.stage is not distinct from 'livre' then
    return new;
  end if;

  select id into v_default_wh from public.warehouses where is_default limit 1;
  if v_default_wh is null then
    raise notice 'Aucun entrepôt par défaut — sortie de stock non enregistrée pour la commande %', new.number;
    return new;
  end if;

  -- Un aller-retour d'étape (livré -> prête -> livré) ne doit pas sortir la
  -- marchandise deux fois.
  select count(*) into v_already
  from public.stock_moves
  where pipeline_order_id = new.id and type = 'sortie';
  if v_already > 0 then
    return new;
  end if;

  insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, note, pipeline_order_id, created_by)
  select cible.id,
         v_default_wh,
         -abs(i.quantity),
         'sortie',
         new.number,
         'Livraison — ' || i.product_name,
         new.id,
         auth.uid()
  from public.pipeline_order_items i
  -- La clé catalogue d'abord ; le nom normalisé ne sert que pour les lignes
  -- antérieures à 0035, et de façon déterministe (la plus ancienne fiche).
  cross join lateral (
    select coalesce(
      i.product_id,
      (select p.id
         from public.products p
        where lower(trim(p.name)) = lower(trim(i.product_name))
        order by p.created_at
        limit 1)
    ) as id
  ) resolu
  join public.products cible on cible.id = resolu.id and cible.track_inventory
  where i.pipeline_order_id = new.id
    and i.quantity > 0;

  return new;
end $$;

drop trigger if exists inventory_out_on_delivery_trigger on public.pipeline_orders;
create trigger inventory_out_on_delivery_trigger
  after update on public.pipeline_orders
  for each row execute function public.inventory_out_on_delivery();

revoke execute on function public.inventory_out_on_delivery() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Reprise de l'historique d'inventory_movements
--
-- Ces lignes sont les livraisons déjà effectuées, enregistrées en quantité
-- positive avec movement_type = 'out'. On les réécrit dans stock_moves avec le
-- signe correct. La garde sur pipeline_order_id rend la reprise rejouable sans
-- double décompte, et les lignes sans produit rattaché sont laissées de côté :
-- elles n'ont jamais désigné d'article du catalogue.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.inventory_movements') is null then
    return;
  end if;

  insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, note, pipeline_order_id, created_by, created_at)
  select m.product_id,
         (select id from public.warehouses where is_default limit 1),
         case when m.movement_type = 'in' then abs(m.quantity) else -abs(m.quantity) end,
         case when m.movement_type = 'in' then 'entree' else 'sortie' end,
         coalesce(po.number, 'REPRISE'),
         'Reprise historique (' || coalesce(m.reason, m.movement_type) || ')',
         m.pipeline_order_id,
         m.recorded_by,
         m.created_at
    from public.inventory_movements m
    left join public.pipeline_orders po on po.id = m.pipeline_order_id
   where m.product_id is not null
     and m.quantity <> 0
     and (select id from public.warehouses where is_default limit 1) is not null
     and not exists (
       select 1 from public.stock_moves s
        where s.pipeline_order_id is not distinct from m.pipeline_order_id
          and s.product_id = m.product_id
          and s.created_at = m.created_at
     );
end $$;

comment on table public.inventory_movements is
  'OBSOLÈTE depuis 0038 — conservée en lecture pour l''historique. Les mouvements de stock vivent dans stock_moves.';

-- ----------------------------------------------------------------------------
-- 4. Niveaux de stock
--
-- product_stock_levels garde son contrat (product_id, sku, name, warehouse_id,
-- warehouse_name, quantity) : le tableau de bord et le journal s'en servent.
-- Le CROSS JOIN disparaît — une ligne n'existe que là où de la marchandise a
-- réellement bougé.
-- ----------------------------------------------------------------------------
drop view if exists public.product_stock_levels;
create view public.product_stock_levels as
  select
    p.id            as product_id,
    p.sku,
    p.name,
    w.id            as warehouse_id,
    w.name          as warehouse_name,
    sum(sm.quantity) as quantity,
    max(sm.created_at) as last_move_at
  from public.stock_moves sm
  join public.products p   on p.id = sm.product_id
  join public.warehouses w on w.id = sm.warehouse_id
  group by p.id, p.sku, p.name, w.id, w.name;

alter view public.product_stock_levels set (security_invoker = on);

-- Une ligne par article suivi, qu'il ait bougé ou non : c'est la liste que
-- l'écran de gestion du stock affiche, et la seule qui permette de repérer un
-- article jamais approvisionné.
create or replace view public.product_stock_summary as
  select
    p.id                                as product_id,
    p.sku,
    p.name,
    p.unit,
    p.category_id,
    c.name                              as category_name,
    p.reorder_point,
    p.sale_price,
    p.purchase_cost,
    p.is_active,
    coalesce(sum(sm.quantity), 0)       as quantity,
    round(coalesce(sum(sm.quantity), 0) * p.purchase_cost, 2) as stock_value,
    max(sm.created_at)                  as last_move_at,
    case
      when coalesce(sum(sm.quantity), 0) <= 0 then 'rupture'
      when coalesce(sum(sm.quantity), 0) <= p.reorder_point then 'faible'
      else 'ok'
    end                                 as stock_status
  from public.products p
  left join public.product_categories c on c.id = p.category_id
  left join public.stock_moves sm       on sm.product_id = p.id
  where p.track_inventory
  group by p.id, p.sku, p.name, p.unit, p.category_id, c.name,
           p.reorder_point, p.sale_price, p.purchase_cost, p.is_active;

alter view public.product_stock_summary set (security_invoker = on);

comment on view public.product_stock_summary is
  'Un article suivi par ligne : quantité toutes zones confondues, valeur au coût d''achat, et état (rupture / faible / ok) au regard du seuil de réapprovisionnement.';

-- ----------------------------------------------------------------------------
-- 5. Transfert entre entrepôts
--
-- Le type 'transfert' existait depuis 0001 mais le formulaire n'écrivait qu'un
-- mouvement : la quantité quittait un entrepôt sans jamais arriver dans
-- l'autre, ou l'inverse. Un transfert, ce sont deux écritures indissociables ;
-- une fonction les rend atomiques.
-- ----------------------------------------------------------------------------
create or replace function public.stock_transfer(
  p_product_id   uuid,
  p_from_wh      uuid,
  p_to_wh        uuid,
  p_quantity     numeric,
  p_note         text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_active_user() or public.current_role() = 'readonly' then
    raise exception 'Non autorisé';
  end if;
  if p_from_wh = p_to_wh then
    raise exception 'Les entrepôts de départ et d''arrivée doivent être différents';
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'La quantité à transférer doit être supérieure à zéro';
  end if;

  insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, note, created_by)
  values
    (p_product_id, p_from_wh, -abs(p_quantity), 'transfert', 'Transfert', p_note, v_uid),
    (p_product_id, p_to_wh,    abs(p_quantity), 'transfert', 'Transfert', p_note, v_uid);
end $$;

revoke execute on function public.stock_transfer(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.stock_transfer(uuid, uuid, uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Cohérence des signes
--
-- Rien n'empêchait d'enregistrer une 'entree' négative ou une 'sortie'
-- positive — deux mouvements qui augmentent le stock alors qu'ils prétendent
-- le diminuer. L'application signe déjà correctement ; la base le garantit
-- désormais pour tout ce qui l'écrit, y compris les triggers.
--
-- Le stock négatif, lui, reste permis : une sortie constatée avant la
-- réception de la marchandise correspondante est un fait, et le refuser
-- bloquerait une livraison réelle. L'écran de gestion le signale en rupture.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_moves_sens_coherent'
  ) then
    -- Les lignes existantes incohérentes sont d'abord remises dans le bon sens.
    update public.stock_moves set quantity = abs(quantity)  where type = 'entree' and quantity < 0;
    update public.stock_moves set quantity = -abs(quantity) where type = 'sortie' and quantity > 0;

    -- Zéro toléré plutôt que rejeté : un mouvement nul est sans effet, et une
    -- migration ne doit pas échouer sur une ligne d'historique inoffensive.
    alter table public.stock_moves add constraint stock_moves_sens_coherent check (
      (type = 'entree'  and quantity >= 0) or
      (type = 'sortie'  and quantity <= 0) or
      (type in ('ajustement', 'transfert'))
    );
  end if;
end $$;
