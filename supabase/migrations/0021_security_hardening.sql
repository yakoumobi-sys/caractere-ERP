-- ============================================================================
-- Caractère ERP — Durcissement sécurité (revue du 2026-08-24, suite)
--
-- 1. Les triggers de comptabilisation automatique (post_invoice_journal,
--    post_payment_journal, reverse_payment_journal, receive_purchase_order)
--    n'étaient PAS SECURITY DEFINER, alors que l'écriture directe sur
--    journal_entries/journal_lines est réservée à admin/accounting
--    (0003_rls.sql). Un utilisateur 'sales' qui validait une facture, ou
--    'purchasing' qui réceptionnait une commande fournisseur, voyait donc le
--    trigger échouer (RLS bloquant l'INSERT dans journal_entries) — l'action
--    elle-même échouait. Repassés en SECURITY DEFINER : la saisie manuelle du
--    journal (page Comptabilité) reste restreinte à admin/accounting via les
--    policies existantes, seule la comptabilisation automatique déclenchée
--    par une action métier légitime est débloquée.
-- 2. receive_purchase_order() plantait (contrainte NOT NULL) dès qu'une ligne
--    de commande fournisseur n'était pas reliée à un produit du catalogue
--    (ligne libre type "Livraison", ou achat de fourniture non cataloguée
--    via le module Alertes) : corrigé pour ignorer ces lignes (rien à
--    recevoir en stock).
-- 3. search_path fixé sur toutes les fonctions encore signalées "mutable".
-- 4. Vues en SECURITY DEFINER (ignoraient totalement RLS, exposées à la clé
--    anon) repassées en SECURITY INVOKER.
-- 5. Droits d'exécution resserrés sur les fonctions SECURITY DEFINER
--    sensibles : retirés pour anon partout, et pour authenticated sur celles
--    qui ne sont que des gestionnaires de trigger (jamais appelées en RPC
--    direct) — en gardant l'exécution pour authenticated sur next_document_
--    number (appelée en imbriqué depuis des triggers non-DEFINER) et sur les
--    3 fonctions du module Alertes réellement appelées en RPC par l'app.
-- 6. yalidine_tracking_history avait RLS activée sans la moindre policy :
--    personne ne pouvait le lire. Alignée sur yalidine_shipments.
-- ============================================================================

create or replace function public.post_invoice_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry_id uuid;
  v_acc_client uuid;
  v_acc_vente uuid;
  v_acc_tva uuid;
begin
  if new.status = 'validee' and old.status is distinct from 'validee' then

    if exists (select 1 from public.journal_entries where source_type = 'invoice' and source_id = new.id) then
      return new;
    end if;

    select id into v_acc_client from public.chart_of_accounts where code = '411';
    select id into v_acc_vente from public.chart_of_accounts where code = '706';
    select id into v_acc_tva from public.chart_of_accounts where code = '4457';

    if v_acc_client is null or v_acc_vente is null or v_acc_tva is null then
      raise exception 'Plan comptable incomplet (comptes 411/706/4457 requis) — facture % non validée', new.number;
    end if;

    insert into public.journal_entries (entry_date, reference, description, source_type, source_id, created_by)
    values (new.issue_date, new.number, 'Facture ' || new.number, 'invoice', new.id, new.created_by)
    returning id into v_entry_id;

    insert into public.journal_lines (entry_id, account_id, debit, credit, label) values
      (v_entry_id, v_acc_client, new.total, 0, 'Client — ' || new.number),
      (v_entry_id, v_acc_vente, 0, new.subtotal, 'Vente — ' || new.number),
      (v_entry_id, v_acc_tva, 0, new.tax_total, 'TVA collectée — ' || new.number);

    insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, created_by)
    select il.product_id,
           (select id from public.warehouses where is_default limit 1),
           -il.quantity,
           'sortie',
           new.number,
           new.created_by
    from public.invoice_lines il
    join public.products p on p.id = il.product_id
    where il.invoice_id = new.id and p.track_inventory
      and (select id from public.warehouses where is_default limit 1) is not null;
  end if;
  return new;
end;
$$;

create or replace function public.post_payment_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry_id uuid;
  v_acc_banque uuid;
  v_acc_client uuid;
  v_invoice public.invoices%rowtype;
  v_new_paid numeric(12,2);
begin
  select * into v_invoice from public.invoices where id = new.invoice_id;

  select id into v_acc_banque from public.chart_of_accounts where code = '512';
  select id into v_acc_client from public.chart_of_accounts where code = '411';

  if v_acc_banque is not null and v_acc_client is not null then
    insert into public.journal_entries (entry_date, reference, description, source_type, source_id, created_by)
    values (new.paid_at, v_invoice.number, 'Règlement facture ' || v_invoice.number, 'payment', new.id, new.created_by)
    returning id into v_entry_id;

    insert into public.journal_lines (entry_id, account_id, debit, credit, label) values
      (v_entry_id, v_acc_banque, new.amount, 0, 'Encaissement — ' || v_invoice.number),
      (v_entry_id, v_acc_client, 0, new.amount, 'Règlement client — ' || v_invoice.number);
  end if;

  select coalesce(sum(amount), 0) into v_new_paid from public.payments where invoice_id = new.invoice_id;

  update public.invoices
    set amount_paid = v_new_paid,
        status = case when v_new_paid >= total and total > 0 then 'payee' else status end
    where id = new.invoice_id;

  return new;
end;
$$;

create or replace function public.reverse_payment_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new_paid numeric(12,2);
  v_total numeric(12,2);
begin
  delete from public.journal_entries where source_type = 'payment' and source_id = old.id;

  select coalesce(sum(amount), 0) into v_new_paid from public.payments where invoice_id = old.invoice_id;
  select total into v_total from public.invoices where id = old.invoice_id;

  update public.invoices
    set amount_paid = v_new_paid,
        status = case when status = 'payee' and v_new_paid < v_total then 'validee' else status end
    where id = old.invoice_id;

  return old;
end;
$$;

create or replace function public.receive_purchase_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_default_wh uuid;
  r record;
begin
  if new.status = 'recue' and old.status is distinct from 'recue' then
    select id into v_default_wh from public.warehouses where is_default limit 1;

    if v_default_wh is not null then
      for r in select * from public.purchase_order_lines where po_id = new.id and product_id is not null loop
        if r.quantity > r.received_qty then
          insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, created_by)
          values (r.product_id, v_default_wh, r.quantity - r.received_qty, 'entree', new.number, new.created_by);
        end if;
      end loop;
      update public.purchase_order_lines set received_qty = quantity where po_id = new.id and product_id is not null;
    end if;
  end if;
  return new;
end;
$$;

-- search_path fixé sur les fonctions restantes signalées "mutable" par l'audit.
alter function public.set_invoice_number() set search_path = public;
alter function public.set_po_number() set search_path = public;
alter function public.recompute_totals() set search_path = public;
alter function public.recompute_po_totals() set search_path = public;
alter function public.check_journal_balance() set search_path = public;
-- Plusieurs fonctions durcies ici n'ont jamais été créées par une
-- migration (elles n'existaient que dans la base de production, ajoutées hors
-- migration) : un ALTER FUNCTION direct fait échouer tout ce fichier sur une
-- base reconstruite. On ne durcit que ce qui existe réellement.
do $$
begin
  if to_regprocedure('public.auto_number_order()') is not null then
    execute 'alter function public.auto_number_order() set search_path = public';
  end if;
  if to_regprocedure('public.auto_number_claim()') is not null then
    execute 'alter function public.auto_number_claim() set search_path = public';
  end if;
end $$;
alter function public.generate_claim_number() set search_path = public;
do $$ begin
  if to_regprocedure('public.update_updated_at()') is not null then
    execute 'alter function public.update_updated_at() set search_path = public';
  end if;
end $$;
do $$ begin
  if to_regprocedure('public.mark_as_paid_on_confirmation()') is not null then
    execute 'alter function public.mark_as_paid_on_confirmation() set search_path = public';
  end if;
end $$;
do $$ begin
  if to_regprocedure('public.create_journal_entries_for_order()') is not null then
    execute 'alter function public.create_journal_entries_for_order() set search_path = public';
  end if;
end $$;
alter function public.set_pipeline_number() set search_path = public;
do $$ begin
  if to_regprocedure('public.auto_number_alert()') is not null then
    execute 'alter function public.auto_number_alert() set search_path = public';
  end if;
end $$;
alter function public.log_pipeline_stage() set search_path = public;
do $$ begin
  if to_regprocedure('public.log_yalidine_status_change()') is not null then
    execute 'alter function public.log_yalidine_status_change() set search_path = public';
  end if;
end $$;
do $$ begin
  if to_regprocedure('public.auto_confirm_on_yalidine_delivery()') is not null then
    execute 'alter function public.auto_confirm_on_yalidine_delivery() set search_path = public';
  end if;
end $$;
do $$ begin
  if to_regprocedure('public.get_yalidine_status_label(text)') is not null then
    execute 'alter function public.get_yalidine_status_label(status text) set search_path = public';
  end if;
end $$;
alter function public.set_updated_at() set search_path = public;
alter function public.next_document_number(p_prefix text, p_table text) set search_path = public;
alter function public.set_quote_number() set search_path = public;
alter function public.set_order_number() set search_path = public;
do $$ begin
  if to_regprocedure('public.generate_order_number()') is not null then
    execute 'alter function public.generate_order_number() set search_path = public';
  end if;
end $$;
alter function public.set_updated_at_tasks() set search_path = public;
alter function public.prevent_invoice_status_regression() set search_path = public;
alter function public.lock_invoice_lines_when_posted() set search_path = public;
alter function public.prevent_posted_invoice_delete() set search_path = public;

-- next_document_number : appelée en imbriqué (non SECURITY DEFINER à l'origine)
-- depuis set_invoice_number/set_quote_number/set_order_number/set_po_number/
-- auto_number_alert, qui s'exécutent avec les droits de l'appelant réel. Passée
-- en SECURITY DEFINER + RLS activée sans policy sur document_number_counters :
-- seule cette fonction peut toucher la table de compteurs internes.
alter function public.next_document_number(p_prefix text, p_table text) security definer;
alter table public.document_number_counters enable row level security;

-- Vues SECURITY DEFINER -> SECURITY INVOKER (respectent enfin les policies
-- RLS des tables sous-jacentes ; ces policies autorisent déjà tout
-- utilisateur actif à lire, donc aucun changement de comportement pour
-- l'app — seule la fuite anon est fermée).
alter view public.supply_alerts_view set (security_invoker = on);
do $$ begin
  if to_regclass('public.employee_stats') is not null then
    execute 'alter view public.employee_stats set (security_invoker = on)';
  end if;
end $$;
alter view public.product_stock_levels set (security_invoker = on);
do $$ begin
  if to_regclass('public.yalidine_shipments_view') is not null then
    execute 'alter view public.yalidine_shipments_view set (security_invoker = on)';
  end if;
end $$;
alter view public.pipeline_orders_view set (security_invoker = on);

-- Droits d'exécution resserrés sur les fonctions SECURITY DEFINER sensibles.
revoke execute on function public.alert_on_yalidine_failure() from public, anon, authenticated;
revoke execute on function public.post_invoice_journal() from public, anon, authenticated;
revoke execute on function public.post_payment_journal() from public, anon, authenticated;
revoke execute on function public.reverse_payment_journal() from public, anon, authenticated;
revoke execute on function public.receive_purchase_order() from public, anon, authenticated;
revoke execute on function public.prevent_self_privilege_escalation() from public, anon, authenticated;

revoke execute on function public.next_document_number(p_prefix text, p_table text) from public, anon;
grant execute on function public.next_document_number(p_prefix text, p_table text) to authenticated;

revoke execute on function public.supply_alert_buy(uuid, uuid, numeric, numeric) from public, anon;
revoke execute on function public.supply_alert_complete(uuid) from public, anon;
revoke execute on function public.sync_stale_order_alerts() from public, anon;

-- yalidine_tracking_history : RLS activée sans policy = personne ne pouvait
-- lire l'historique de tracking. Alignée sur yalidine_shipments.
-- Cette table n'est créée par aucune migration (ajoutée hors migration en
-- production) et n'est lue par aucune page de l'application. On ne réinvente
-- pas son schéma ici : on ne la durcit que si elle existe, pour qu'une base
-- reconstruite depuis le dépôt s'applique quand même intégralement.
do $$ begin
  if to_regclass('public.yalidine_tracking_history') is not null then
    execute 'drop policy if exists "yalidine_tracking_history_select" on public.yalidine_tracking_history';
    execute 'create policy "yalidine_tracking_history_select" on public.yalidine_tracking_history for select
      to authenticated using (public.is_active_user())';
    execute 'drop policy if exists "yalidine_tracking_history_write" on public.yalidine_tracking_history';
    execute 'create policy "yalidine_tracking_history_write" on public.yalidine_tracking_history for all
      to authenticated using (public.is_active_user() and public.current_role() in (''admin'', ''sales''))';
  end if;
end $$;
