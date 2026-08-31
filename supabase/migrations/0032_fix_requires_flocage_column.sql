-- ============================================================================
-- Caractère ERP — Fix: Renommer requires_flocage_v2 en requires_flocage
--
-- La migration 0028 a créé requires_flocage_v2 mais le code TypeScript utilise
-- requires_flocage. La migration 0025 avait ajouté requires_flocage à la vue
-- sans jamais créer la colonne. Cette migration corrige le problème en:
-- 1. Renommant requires_flocage_v2 en requires_flocage si elle existe
-- 2. Créant requires_flocage si aucune des deux n'existe
-- 3. Mettant à jour la vue pour utiliser la bonne colonne
-- ============================================================================

-- 1. Gérer le renommage/création de la colonne de manière idempotente
do $$
declare
  has_v2 boolean;
  has_regular boolean;
begin
  -- Vérifier l'existence des colonnes
  has_v2 := exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'pipeline_orders'
    and column_name = 'requires_flocage_v2'
  );

  has_regular := exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'pipeline_orders'
    and column_name = 'requires_flocage'
  );

  if has_v2 and not has_regular then
    -- Renommer requires_flocage_v2 en requires_flocage
    alter table public.pipeline_orders rename column requires_flocage_v2 to requires_flocage;
    raise notice 'Renamed requires_flocage_v2 to requires_flocage';
  elsif not has_regular then
    -- Créer requires_flocage si elle n'existe pas
    alter table public.pipeline_orders add column requires_flocage boolean default true;
    raise notice 'Created requires_flocage column';
  else
    raise notice 'requires_flocage column already exists';
  end if;
end $$;

-- 2. Mettre à jour la vue pour inclure la colonne requires_flocage
create or replace view public.pipeline_orders_view as
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
  e.color as assignee_color,
  po.created_by,
  po.created_at,
  po.updated_at,
  (select max(l.created_at)
     from pipeline_stage_log l
    where l.pipeline_order_id = po.id and l.status = po.status) as status_since,
  coalesce(po.requires_flocage, true) as requires_flocage
from pipeline_orders po
  left join contacts c on c.id = po.contact_id
  left join employees e on e.id = po.assigned_to;

alter view public.pipeline_orders_view set (security_invoker = on);
