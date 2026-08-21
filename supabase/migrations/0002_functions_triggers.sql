-- ============================================================================
-- Caractère ERP — fonctions métier & déclencheurs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at automatique
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['contacts','opportunities','products','suppliers','purchase_orders',
                            'sales_quotes','sales_orders','invoices','employees','projects']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Création automatique du profil à l'inscription (1er utilisateur = admin)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'readonly' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Numérotation automatique des documents
-- ----------------------------------------------------------------------------
create or replace function public.next_document_number(p_prefix text, p_table text)
returns text language plpgsql as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_count int;
  v_number text;
begin
  execute format(
    'select count(*) from public.%I where number like %L',
    p_table, p_prefix || '-' || v_year || '-%'
  ) into v_count;
  v_number := p_prefix || '-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  return v_number;
end;
$$;

create or replace function public.set_quote_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := public.next_document_number('DEV', 'sales_quotes');
  end if;
  return new;
end;
$$;
create trigger set_quote_number before insert on public.sales_quotes
  for each row execute function public.set_quote_number();

create or replace function public.set_order_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := public.next_document_number('CMD', 'sales_orders');
  end if;
  return new;
end;
$$;
create trigger set_order_number before insert on public.sales_orders
  for each row execute function public.set_order_number();

create or replace function public.set_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := public.next_document_number('FAC', 'invoices');
  end if;
  return new;
end;
$$;
create trigger set_invoice_number before insert on public.invoices
  for each row execute function public.set_invoice_number();

create or replace function public.set_po_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := public.next_document_number('BC', 'purchase_orders');
  end if;
  return new;
end;
$$;
create trigger set_po_number before insert on public.purchase_orders
  for each row execute function public.set_po_number();

-- ----------------------------------------------------------------------------
-- Recalcul automatique des totaux (lignes -> en-tête)
-- ----------------------------------------------------------------------------
create or replace function public.recompute_totals()
returns trigger language plpgsql as $$
declare
  v_header_table text := tg_argv[0];
  v_header_id uuid;
  v_line_table text := tg_table_name;
  v_fk text := tg_argv[1];
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
begin
  v_header_id := coalesce(to_jsonb(new) ->> v_fk, to_jsonb(old) ->> v_fk)::uuid;

  execute format(
    'select coalesce(sum(quantity*unit_price),0), coalesce(sum(quantity*unit_price*tax_rate/100),0) from public.%I where %I = $1',
    v_line_table, v_fk
  ) into v_subtotal, v_tax using v_header_id;

  execute format(
    'update public.%I set subtotal = $1, tax_total = $2, total = $1 + $2 where id = $3',
    v_header_table
  ) using v_subtotal, v_tax, v_header_id;

  return coalesce(new, old);
end;
$$;

-- purchase_order_lines utilise unit_cost au lieu de unit_price -> fonction dédiée
create or replace function public.recompute_po_totals()
returns trigger language plpgsql as $$
declare
  v_po_id uuid := coalesce(new.po_id, old.po_id);
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
begin
  select coalesce(sum(quantity*unit_cost),0), coalesce(sum(quantity*unit_cost*tax_rate/100),0)
    into v_subtotal, v_tax
    from public.purchase_order_lines where po_id = v_po_id;

  update public.purchase_orders
    set subtotal = v_subtotal, tax_total = v_tax, total = v_subtotal + v_tax
    where id = v_po_id;

  return coalesce(new, old);
end;
$$;

create trigger recompute_quote_totals
  after insert or update or delete on public.sales_quote_lines
  for each row execute function public.recompute_totals('sales_quotes', 'quote_id');

create trigger recompute_order_totals
  after insert or update or delete on public.sales_order_lines
  for each row execute function public.recompute_totals('sales_orders', 'order_id');

create trigger recompute_invoice_totals
  after insert or update or delete on public.invoice_lines
  for each row execute function public.recompute_totals('invoices', 'invoice_id');

create trigger recompute_po_totals
  after insert or update or delete on public.purchase_order_lines
  for each row execute function public.recompute_po_totals();

-- ----------------------------------------------------------------------------
-- Comptabilisation automatique d'une facture validée
-- Débit 411 Clients (TTC) / Crédit 706 Ventes (HT) / Crédit 4457 TVA collectée
-- ----------------------------------------------------------------------------
create or replace function public.post_invoice_journal()
returns trigger language plpgsql as $$
declare
  v_entry_id uuid;
  v_acc_client uuid;
  v_acc_vente uuid;
  v_acc_tva uuid;
begin
  if new.status = 'validee' and old.status is distinct from 'validee' then
    select id into v_acc_client from public.chart_of_accounts where code = '411';
    select id into v_acc_vente from public.chart_of_accounts where code = '706';
    select id into v_acc_tva from public.chart_of_accounts where code = '4457';

    if v_acc_client is null or v_acc_vente is null or v_acc_tva is null then
      raise notice 'Plan comptable incomplet (411/706/4457) — écriture non générée pour la facture %', new.number;
      return new;
    end if;

    insert into public.journal_entries (entry_date, reference, description, source_type, source_id, created_by)
    values (new.issue_date, new.number, 'Facture ' || new.number, 'invoice', new.id, new.created_by)
    returning id into v_entry_id;

    insert into public.journal_lines (entry_id, account_id, debit, credit, label) values
      (v_entry_id, v_acc_client, new.total, 0, 'Client — ' || new.number),
      (v_entry_id, v_acc_vente, 0, new.subtotal, 'Vente — ' || new.number),
      (v_entry_id, v_acc_tva, 0, new.tax_total, 'TVA collectée — ' || new.number);

    -- Sortie de stock pour les produits suivis
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

create trigger post_invoice_journal
  after update on public.invoices
  for each row execute function public.post_invoice_journal();

-- ----------------------------------------------------------------------------
-- Encaissement d'une facture : débit 512 Banque / crédit 411 Clients
-- ----------------------------------------------------------------------------
create or replace function public.post_payment_journal()
returns trigger language plpgsql as $$
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

create trigger post_payment_journal
  after insert on public.payments
  for each row execute function public.post_payment_journal();

-- ----------------------------------------------------------------------------
-- Réception d'une commande fournisseur -> entrée de stock
-- ----------------------------------------------------------------------------
create or replace function public.receive_purchase_order()
returns trigger language plpgsql as $$
declare
  v_default_wh uuid;
  r record;
begin
  if new.status = 'recue' and old.status is distinct from 'recue' then
    select id into v_default_wh from public.warehouses where is_default limit 1;

    if v_default_wh is not null then
      for r in select * from public.purchase_order_lines where po_id = new.id loop
        if r.quantity > r.received_qty then
          insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, created_by)
          values (r.product_id, v_default_wh, r.quantity - r.received_qty, 'entree', new.number, new.created_by);
        end if;
      end loop;
      update public.purchase_order_lines set received_qty = quantity where po_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger receive_purchase_order
  after update on public.purchase_orders
  for each row execute function public.receive_purchase_order();

-- ----------------------------------------------------------------------------
-- Contrôle d'équilibre d'une écriture comptable saisie manuellement
-- ----------------------------------------------------------------------------
create or replace function public.check_journal_balance()
returns trigger language plpgsql as $$
declare
  v_diff numeric(12,2);
begin
  select coalesce(sum(debit),0) - coalesce(sum(credit),0) into v_diff
  from public.journal_lines where entry_id = coalesce(new.entry_id, old.entry_id);

  if v_diff <> 0 then
    raise exception 'Écriture déséquilibrée (débit - crédit = %)', v_diff;
  end if;
  return coalesce(new, old);
end;
$$;

create constraint trigger check_journal_balance
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function public.check_journal_balance();
