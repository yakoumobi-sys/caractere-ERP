-- Bouton « Commande terminée » sur toutes les commandes en cours.
-- Pour un brouillon, le gérant peut la terminer directement : la commande est confirmée (sans BAT ni acompte exigés,
-- motif tracé dans l'historique), ses tâches atelier sont créées puis terminées, et elle passe « Prête ».
-- Aucun paiement n'est créé.
create or replace function erp.complete_order(p_order uuid) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); o record; l record;
begin
  select * into o from erp.orders where id = p_order for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status in ('prete','expediee','a_retirer','livree','retiree') then return o.status; end if;
  if o.status in ('annulee','retournee') then raise exception 'Commande %.', o.status; end if;
  if o.status = 'brouillon' then
    if not erp.can('waive_deposit') then
      raise exception 'Commande en brouillon : seul le gérant peut la terminer directement.';
    end if;
    if not exists (select 1 from erp.lines where order_id = p_order) then raise exception 'La commande ne contient aucune ligne.'; end if;
    update erp.orders set status = 'confirmee', confirmed_at = now(), confirmed_by = me, updated_at = now(),
      deposit_waived_reason = coalesce(deposit_waived_reason, 'Terminée directement par le gérant (sans confirmation préalable)')
    where id = p_order;
    for l in select id from erp.lines where order_id = p_order order by position loop
      perform erp.reserve_line(l.id);
      perform erp.create_tasks(l.id);
    end loop;
    update erp.clients set kind = 'client', updated_at = now() where id = o.client_id and kind = 'prospect';
    perform erp.log_order(p_order, 'confirmation', jsonb_build_object('status','brouillon'), jsonb_build_object('status','confirmee'),
      'Confirmée automatiquement par « Commande terminée » (BAT, accord et acompte non vérifiés)');
  end if;
  return erp.finish_order(p_order);
end $$;

revoke all on function erp.complete_order(uuid) from public, anon;
grant execute on function erp.complete_order(uuid) to authenticated;
