-- ============================================================================
-- Caractère ERP — Correction de deux triggers créés hors migration.
--
-- Relevés sur la base de production (pg_get_functiondef, 2026-08-30) : ils
-- n'existaient dans aucun fichier du dépôt, donc n'avaient jamais été relus.
-- Tous deux portent sur pipeline_orders et concernent la fin du parcours de
-- commande (confirmation de livraison, comptabilisation).
--
-- 1. mark_as_paid_on_confirmation — BLOQUANT
--    BEFORE UPDATE, il faisait « new.status := 'payee' ». Or 'payee' ne fait
--    pas partie de pipeline_orders_status_check (migration 0008), qui n'admet
--    que attente_dtf, impression_dtf, attente_broderie, en_broderie,
--    attente_gros, en_preparation_gros, prete, livree.
--    Conséquence : TOUTE mise à jour renseignant delivery_confirmed_at
--    échouait avec « violates check constraint
--    pipeline_orders_status_check » — la confirmation de livraison était donc
--    impossible.
--    L'état de paiement a sa propre colonne depuis la migration 0030
--    (payment_status : unpaid / partial / paid). On y écrit désormais, et on
--    laisse status décrire l'avancement en production, ce qu'il décrit.
--
-- 2. create_journal_entries_for_order — inerte et incorrect
--    AFTER UPDATE, conditionné à « new.status = 'payee' » : depuis la
--    migration 0008 aucune ligne ne peut porter ce statut, donc ce trigger
--    n'a jamais pu s'exécuter. S'il s'exécutait il échouerait, car il insère
--    dans journal_entries les colonnes order_id, account_code, amount et
--    entry_type, alors que la table (migration 0001) porte entry_date,
--    reference, description, source_type, source_id et created_by.
--    La comptabilisation des règlements de commande est déjà assurée, avec le
--    bon schéma, par post_order_payment_journal sur order_payments.
--    On détache donc le trigger. La fonction est conservée telle quelle : si
--    une comptabilisation par commande est souhaitée un jour, elle sera
--    réécrite sur le schéma réel plutôt que rebranchée en l'état.
-- ============================================================================

create or replace function public.mark_as_paid_on_confirmation()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.delivery_confirmed_at is not null and new.paid_at is null then
    new.paid_at := now();
    -- surtout pas new.status : 'payee' viole pipeline_orders_status_check.
    new.payment_status := 'paid';
  end if;
  return new;
end;
$function$;

drop trigger if exists auto_journal_entries on public.pipeline_orders;
