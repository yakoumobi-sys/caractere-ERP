-- ============================================================================
-- Caractère ERP — simplification du parcours de production
-- Le flocage n'est plus une étape systématique après le DTF (certaines
-- commandes DTF n'en ont pas besoin). La technique "simple" devient "aucune"
-- (vêtements bruts, sans impression ni broderie) et route vers une nouvelle
-- file "commande gros" plutôt que vers un atelier.
--
-- Nouveau parcours par technique :
--   dtf      : attente_dtf -> impression_dtf -> prete
--   broderie : attente_broderie -> en_broderie -> prete
--   aucune   : attente_gros -> en_preparation_gros -> prete
--   (commun) : prete -> livree
-- ============================================================================

alter table public.pipeline_orders drop constraint if exists pipeline_orders_status_check;
alter table public.pipeline_orders drop constraint if exists pipeline_orders_technique_check;

update public.pipeline_orders set status = case status
  when 'attente_flocage' then 'attente_dtf'
  when 'en_flocage' then 'impression_dtf'
  when 'attente_simple' then 'attente_gros'
  when 'en_simple' then 'en_preparation_gros'
  else status
end;

update public.pipeline_orders set technique = 'aucune' where technique = 'simple';

alter table public.pipeline_orders add constraint pipeline_orders_technique_check
  check (technique in ('dtf','broderie','aucune'));

alter table public.pipeline_orders add constraint pipeline_orders_status_check check (status in (
  'attente_dtf','impression_dtf',
  'attente_broderie','en_broderie',
  'attente_gros','en_preparation_gros',
  'prete','livree'
));
