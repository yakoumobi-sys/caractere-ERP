-- ============================================================================
-- Caractère ERP — Audit du 2026-09-04 : paiements, objectifs, sécurité
--
-- 1) Objectifs du mois : objective_updates avait RLS activée SANS policy —
--    chaque mise à jour de progression était refusée en silence. La page
--    elle-même était en 404 pour tout le monde (colonne employees.auth_user_id
--    inexistante, corrigé côté code : c'est profile_id).
--
-- 2) Paiements : pipeline_orders.payment_status n'était calculé qu'à la
--    création de la commande et plus jamais mis à jour ensuite ; le solde
--    client était écrasé par la dernière commande payée au lieu de cumuler
--    toutes ses commandes. Un seul trigger recalcule désormais les deux à
--    chaque paiement enregistré/supprimé et à chaque changement de montant.
--
-- 3) Sécurité (advisors Supabase) : trois vues de reporting en SECURITY
--    DEFINER (elles ignoraient les policies RLS), huit fonctions internes
--    exécutables par le rôle anon via /rest/v1/rpc, trois fonctions sans
--    search_path fixé.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Objectifs : policies manquantes
-- ----------------------------------------------------------------------------
drop policy if exists "objective_updates_select" on public.objective_updates;
create policy "objective_updates_select" on public.objective_updates for select to authenticated
  using (public.is_active_user());

drop policy if exists "objective_updates_insert" on public.objective_updates;
create policy "objective_updates_insert" on public.objective_updates for insert to authenticated
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- ----------------------------------------------------------------------------
-- 2. Paiements : statut de paiement et solde client toujours à jour
-- ----------------------------------------------------------------------------
-- Solde du client = ce qu'il doit sur L'ENSEMBLE de ses commandes
-- (positif : reste à payer ; négatif : crédit).
create or replace function public.recompute_contact_balance(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_contact_id is null then return; end if;
  update public.contacts c
  set balance = coalesce((
      select sum(coalesce(po.order_total, 0)) from public.pipeline_orders po where po.contact_id = c.id
    ), 0) - coalesce((
      select sum(op.amount)
      from public.order_payments op
      join public.pipeline_orders po on po.id = op.pipeline_order_id
      where po.contact_id = c.id
    ), 0)
  where c.id = p_contact_id;
end;
$$;

revoke execute on function public.recompute_contact_balance(uuid) from public, anon, authenticated;

create or replace function public.recompute_order_payment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_paid numeric;
  v_contact uuid;
begin
  select order_total, contact_id into v_total, v_contact
  from public.pipeline_orders where id = p_order_id;
  if not found then return; end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.order_payments where pipeline_order_id = p_order_id;

  update public.pipeline_orders
  set payment_status = case
        when v_paid <= 0 then 'unpaid'
        when v_total is not null and v_total > 0 and v_paid >= v_total then 'paid'
        else 'partial'
      end,
      paid_at = case
        when v_total is not null and v_total > 0 and v_paid >= v_total then coalesce(paid_at, now())
        else null
      end
  where id = p_order_id;

  perform public.recompute_contact_balance(v_contact);
end;
$$;

revoke execute on function public.recompute_order_payment(uuid) from public, anon, authenticated;

create or replace function public.order_payments_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_order_payment(coalesce(new.pipeline_order_id, old.pipeline_order_id));
  return coalesce(new, old);
end;
$$;

-- Remplace l'ancien calcul de solde (qui écrasait le solde avec la seule
-- commande en cours de paiement).
drop trigger if exists update_client_balance_on_payment_trigger on public.order_payments;
drop function if exists public.update_client_balance_on_payment();

drop trigger if exists order_payments_recompute on public.order_payments;
create trigger order_payments_recompute
  after insert or update or delete on public.order_payments
  for each row execute function public.order_payments_recompute();

-- Le montant de la commande peut être saisi à la création ou corrigé après
-- coup : le statut et le solde suivent. Une commande supprimée n'est plus
-- due. Le WHEN sur UPDATE évite toute récursion (le recalcul ne touche pas
-- order_total).
create or replace function public.pipeline_orders_total_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_contact_balance(old.contact_id);
    return old;
  end if;
  perform public.recompute_order_payment(new.id);
  if tg_op = 'UPDATE' and old.contact_id is distinct from new.contact_id then
    perform public.recompute_contact_balance(old.contact_id);
  end if;
  return new;
end;
$$;

drop trigger if exists pipeline_orders_total_changed on public.pipeline_orders;
create trigger pipeline_orders_total_changed
  after update of order_total, contact_id on public.pipeline_orders
  for each row
  when (old.order_total is distinct from new.order_total or old.contact_id is distinct from new.contact_id)
  execute function public.pipeline_orders_total_changed();

drop trigger if exists pipeline_orders_total_insert on public.pipeline_orders;
create trigger pipeline_orders_total_insert
  after insert on public.pipeline_orders
  for each row
  when (new.order_total is not null)
  execute function public.pipeline_orders_total_changed();

drop trigger if exists pipeline_orders_total_delete on public.pipeline_orders;
create trigger pipeline_orders_total_delete
  after delete on public.pipeline_orders
  for each row
  execute function public.pipeline_orders_total_changed();

revoke execute on function public.order_payments_recompute() from public, anon, authenticated;
revoke execute on function public.pipeline_orders_total_changed() from public, anon, authenticated;

-- Aligne les commandes existantes (43 à ce jour, aucun paiement encore
-- enregistré : tout repasse proprement en "unpaid"/"partial"/"paid").
do $$
declare r record;
begin
  for r in select id from public.pipeline_orders loop
    perform public.recompute_order_payment(r.id);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Sécurité
-- ----------------------------------------------------------------------------
-- Vues de reporting : respectent enfin les policies RLS du lecteur. Les
-- tables sous-jacentes sont toutes lisibles par un utilisateur actif, donc
-- aucun changement pour l'application — seule la lecture anonyme se ferme.
alter view public.production_stats set (security_invoker = on);
alter view public.daily_kpi set (security_invoker = on);
alter view public.employee_performance set (security_invoker = on);

-- Fonctions internes : plus d'appel possible sans session. Les helpers de
-- policies (current_role, is_active_user, current_user_id) restent
-- exécutables par authenticated, c'est ainsi que les policies les évaluent.
-- ATTENTION : "revoke from public" retire aussi le droit implicite dont
-- authenticated héritait — sans le grant explicite qui suit, chaque policy
-- RLS échouerait en « permission denied for function » (vérifié hors ligne).
revoke execute on function public."current_role"() from public, anon;
revoke execute on function public.current_user_id() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.calculate_flocage_cost() from public, anon;
grant execute on function public."current_role"() to authenticated;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.calculate_flocage_cost() to authenticated;

-- Fonctions de trigger : jamais appelées directement (même précédent que la
-- migration 0021 pour post_invoice_journal & co).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.inventory_out_on_delivery() from public, anon, authenticated;
revoke execute on function public.post_order_payment_journal() from public, anon, authenticated;

-- search_path fixé (fonctions créées hors migration, signalées par l'advisor).
alter function public.create_product_variants() set search_path = public;
alter function public.calculate_dtf_cost(p_product_id uuid, p_dtf_length_cm integer) set search_path = public;
alter function public.calculate_final_price(p_product_id uuid, p_dtf_length_cm integer) set search_path = public;
