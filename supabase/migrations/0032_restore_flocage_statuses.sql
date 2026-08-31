-- ============================================================================
-- Caractère ERP — Correctif : le parcours de la commande bloque entre le DTF
-- et le FLOCAGE.
--
-- Symptôme : sur une commande DTF marquée "flocage requis", le clic sur
-- "Marquer terminée" (statut impression_dtf) échoue avec une erreur de rendu
-- ("An error occurred in the Server Components render"). La commande reste
-- coincée en "Impression en cours" et n'arrive jamais dans la File Flocage.
--
-- Cause : la migration 0008_simplify_production_flow.sql avait supprimé
-- l'étape Flocage du parcours et reconstruit la contrainte
-- pipeline_orders_status_check SANS les statuts 'attente_flocage' et
-- 'en_flocage'. La migration 0025_add_flocage_queue.sql a ensuite réintroduit
-- la file Flocage côté application (lib/pipeline.ts, advancePipelineOrder,
-- page /production/flocage, vue pipeline_orders_view) mais n'a jamais
-- réautorisé ces deux statuts en base. L'UPDATE
--   update pipeline_orders set status = 'attente_flocage'
-- est donc rejeté par Postgres (violation de contrainte CHECK 23514),
-- l'action serveur lève, et Next.js affiche la page d'erreur générique.
--
-- Correctif : reconstruire la contrainte avec les 10 statuts réellement
-- utilisés par lib/pipeline.ts (STATUS_DEFS).
--
-- Parcours complet après ce correctif :
--   dtf (sans flocage) : attente_dtf -> impression_dtf -> prete
--   dtf (avec flocage) : attente_dtf -> impression_dtf -> attente_flocage
--                        -> en_flocage -> prete
--   broderie           : attente_broderie -> en_broderie -> prete
--   aucune             : attente_gros -> en_preparation_gros -> prete
--   (commun)           : prete -> livree
-- ============================================================================

alter table public.pipeline_orders drop constraint if exists pipeline_orders_status_check;

alter table public.pipeline_orders add constraint pipeline_orders_status_check check (status in (
  'attente_dtf','impression_dtf',
  'attente_flocage','en_flocage',
  'attente_broderie','en_broderie',
  'attente_gros','en_preparation_gros',
  'prete','livree'
));

-- Colonne morte laissée par 0028 (jamais lue ni écrite par l'application :
-- le configurateur et advancePipelineOrder n'utilisent que
-- pipeline_orders.requires_flocage). On la supprime pour éviter toute
-- confusion sur la source de vérité du "flocage requis".
alter table public.pipeline_orders drop column if exists requires_flocage_v2;
