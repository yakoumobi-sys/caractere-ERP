-- ============================================================================
-- Caractère ERP — File de production "Flocage".
--
-- Une commande DTF peut être marquée "à envoyer en flocage après
-- l'impression" (case à cocher du configurateur, étape 3). Une fois
-- l'impression DTF terminée, au lieu de passer directement au statut "prête",
-- la commande part dans la file Flocage (attente_flocage -> en_flocage ->
-- prete). Voir lib/pipeline.ts (STATUS_DEFS) et
-- lib/actions/pipeline-actions.ts (advancePipelineOrder).
--
-- pipeline_orders.requires_flocage existait déjà en base mais n'était ni
-- écrit, ni lu, ni exposé par la vue utilisée par le tableau de production et
-- la fiche détail — on l'ajoute ici à pipeline_orders_view. Un
-- CREATE OR REPLACE VIEW ne peut qu'ajouter une colonne à la fin de la liste
-- (pas la réordonner), d'où sa position en dernier.
-- ============================================================================
-- requires_flocage était supposée « exister déjà en base » (ajoutée hors
-- migration) : sur une base reconstruite depuis le dépôt elle n'apparaît qu'en
-- migration 0029, plus tard, et la vue ci-dessous ne pouvait pas être créée.
-- On la garantit ici ; 0029 la redéclare avec "if not exists", sans effet.
alter table public.pipeline_orders add column if not exists requires_flocage boolean default false;

create or replace view public.pipeline_orders_view as
 select po.id,
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
