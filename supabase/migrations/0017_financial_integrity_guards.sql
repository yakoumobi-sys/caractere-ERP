-- ============================================================================
-- Caractère ERP — Garde-fous d'intégrité financière (2026-08-24)
--
-- Suite à une revue de code ciblée sur la comptabilité/facturation/CRM
-- (demande explicite : pouvoir faire confiance à l'ERP sur les finances).
-- Aucune donnée réelle n'existait encore dans invoices/payments/
-- journal_entries/sales_orders/sales_quotes/purchase_orders au moment de ce
-- correctif (0 ligne) : appliqué directement sans migration de données, puis
-- vérifié par un scénario de bout en bout (créer → valider → tenter de
-- contourner → payer → annuler le paiement → nettoyer), voir le journal de
-- session pour le détail des 9 vérifications.
--
-- Bugs corrigés :
--   1. Un utilisateur pouvait s'auto-promouvoir admin en modifiant son propre
--      profil (la policy RLS ne restreignait aucune colonne).
--   2. Repasser une facture validée en "brouillon" puis la revalider
--      provoquait une double écriture comptable ET une double sortie de
--      stock (le trigger ne vérifiait que la transition de statut, pas si
--      une écriture existait déjà).
--   3. Modifier les lignes d'une facture déjà validée désynchronisait
--      silencieusement l'écriture comptable et la sortie de stock déjà
--      posées du contenu réellement affiché à l'écran.
--   4. Supprimer un paiement ne recalculait jamais le solde/statut de la
--      facture ni n'annulait l'écriture comptable correspondante — une
--      facture pouvait rester "payée" après suppression du règlement.
--   5. Supprimer une facture validée/payée laissait ses écritures comptables
--      orphelines (aucune contrainte de clé étrangère vers invoices).
--   6. La numérotation des documents (FAC/DEV/CMD/BC) utilisait un
--      `count(*)` sans verrou : deux créations simultanées pouvaient
--      calculer le même numéro, et un numéro se libérait après suppression.
--   7. Un plan comptable incomplet ne bloquait pas la validation d'une
--      facture : elle passait "validée" sans écriture ni sortie de stock, et
--      rien ne le signalait (juste un RAISE NOTICE invisible pour l'appli).
-- ============================================================================

-- 1. Anti-escalade de privilège
create or replace function public.prevent_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and public.current_role() <> 'admin' then
    raise exception 'Seul un administrateur peut modifier le rôle ou le statut actif d''un utilisateur';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_privilege_escalation_trigger on public.profiles;
create trigger prevent_self_privilege_escalation_trigger
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_escalation();

-- 2. Une facture validée ne peut plus repasser en brouillon
create or replace function public.prevent_invoice_status_regression()
returns trigger language plpgsql as $$
begin
  if old.status in ('validee','payee') and new.status = 'brouillon' then
    raise exception 'Une facture validée ne peut pas repasser en brouillon (utiliser un avoir ou l''annulation)';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_invoice_status_regression_trigger on public.invoices;
create trigger prevent_invoice_status_regression_trigger
  before update on public.invoices
  for each row execute function public.prevent_invoice_status_regression();

-- 3. Lignes d'une facture non-brouillon immuables
create or replace function public.lock_invoice_lines_when_posted()
returns trigger language plpgsql as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_status text;
begin
  select status into v_status from public.invoices where id = v_invoice_id;
  if v_status is not null and v_status <> 'brouillon' then
    raise exception 'Facture % : les lignes d''une facture validée sont figées (utiliser un avoir)',
      (select number from public.invoices where id = v_invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists lock_invoice_lines_when_posted_trigger on public.invoice_lines;
create trigger lock_invoice_lines_when_posted_trigger
  before insert or update or delete on public.invoice_lines
  for each row execute function public.lock_invoice_lines_when_posted();

-- 4. Une facture non-brouillon ne peut plus être supprimée directement
create or replace function public.prevent_posted_invoice_delete()
returns trigger language plpgsql as $$
begin
  if old.status <> 'brouillon' then
    raise exception 'Facture % : impossible de supprimer une facture non-brouillon (utiliser l''annulation)', old.number;
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_posted_invoice_delete_trigger on public.invoices;
create trigger prevent_posted_invoice_delete_trigger
  before delete on public.invoices
  for each row execute function public.prevent_posted_invoice_delete();

-- 5. Comptabilisation facture : idempotente + bloquante si plan comptable incomplet
create or replace function public.post_invoice_journal()
returns trigger language plpgsql as $$
declare
  v_entry_id uuid;
  v_acc_client uuid;
  v_acc_vente uuid;
  v_acc_tva uuid;
begin
  if new.status = 'validee' and old.status is distinct from 'validee' then

    if exists (select 1 from public.journal_entries where source_type = 'invoice' and source_id = new.id) then
      return new; -- déjà comptabilisée (idempotence)
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

-- 6. Suppression d'un paiement : annule l'écriture comptable et recalcule facture
create or replace function public.reverse_payment_journal()
returns trigger language plpgsql as $$
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

drop trigger if exists reverse_payment_journal_trigger on public.payments;
create trigger reverse_payment_journal_trigger
  after delete on public.payments
  for each row execute function public.reverse_payment_journal();

-- 7. Numérotation atomique par préfixe/année (remplace le count(*) racy)
create table if not exists public.document_number_counters (
  prefix text not null,
  year text not null,
  last_number int not null default 0,
  primary key (prefix, year)
);

create or replace function public.next_document_number(p_prefix text, p_table text)
returns text language plpgsql as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
begin
  insert into public.document_number_counters (prefix, year, last_number)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
  do update set last_number = public.document_number_counters.last_number + 1
  returning last_number into v_next;

  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;
