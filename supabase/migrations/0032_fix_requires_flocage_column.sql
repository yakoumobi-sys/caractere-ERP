-- ============================================================================
-- Caractère ERP — Fix: Renommer requires_flocage_v2 en requires_flocage
--
-- La migration 0028 a créé requires_flocage_v2 mais le code TypeScript utilise
-- requires_flocage. La migration 0025 avait ajouté requires_flocage à la vue
-- sans jamais créer la colonne. Cette migration corrige en renommant
-- requires_flocage_v2 en requires_flocage.
-- ============================================================================

-- 1. Renommer la colonne si elle existe
alter table public.pipeline_orders rename column requires_flocage_v2 to requires_flocage;

-- 2. S'assurer que la vue inclut bien le champ
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
  po.requires_flocage
from pipeline_orders po
  left join contacts c on c.id = po.contact_id
  left join employees e on e.id = po.assigned_to;

alter view public.pipeline_orders_view set (security_invoker = on);
