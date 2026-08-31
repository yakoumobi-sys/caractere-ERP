-- ============================================================================
-- Caractère ERP — Ensure requires_flocage column exists
--
-- Migration ultra-simple qui garantit que la colonne requires_flocage existe
-- avec une valeur par défaut true. Ne fait rien si elle existe déjà.
-- ============================================================================

-- 1. Créer la colonne si elle n't existe pas
ALTER TABLE public.pipeline_orders
ADD COLUMN IF NOT EXISTS requires_flocage boolean DEFAULT true;

-- 2. Remplir les valeurs NULL avec true (au cas où)
UPDATE public.pipeline_orders
SET requires_flocage = true
WHERE requires_flocage IS NULL;

-- 3. Rendre la colonne NOT NULL
ALTER TABLE public.pipeline_orders
ALTER COLUMN requires_flocage SET NOT NULL;

-- 4. Supprimer la colonne _v2 si elle existe (migration 0028 la créait avec le mauvais nom)
ALTER TABLE public.pipeline_orders
DROP COLUMN IF EXISTS requires_flocage_v2;

-- 5. Mettre à jour la vue pour inclure requires_flocage
CREATE OR REPLACE VIEW public.pipeline_orders_view AS
SELECT
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
  (SELECT MAX(l.created_at)
     FROM pipeline_stage_log l
    WHERE l.pipeline_order_id = po.id AND l.status = po.status) AS status_since,
  po.requires_flocage
FROM pipeline_orders po
  LEFT JOIN contacts c ON c.id = po.contact_id
  LEFT JOIN employees e ON e.id = po.assigned_to;

ALTER VIEW public.pipeline_orders_view SET (security_invoker = on);
