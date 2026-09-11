-- Transactional commercial documents, payment integrity, CRM follow-ups and cash book.
-- Follows the stock consolidation migration 0038 without replacing it.
-- Additive migration: never rewrites historical journals or existing fiscal settings.
-- Transaction is owned by scripts/db-migrate.mjs.

alter table public.opportunities add column if not exists next_action text;
alter table public.opportunities add column if not exists next_follow_up date;
alter table public.opportunities add column if not exists source text;
alter table public.opportunities add column if not exists lost_reason text;
create index if not exists opportunities_follow_up_idx on public.opportunities(next_follow_up)
  where stage not in ('gagne','perdu');
alter table public.payments add column if not exists request_id uuid unique;
alter table public.order_payments add column if not exists request_id uuid unique;

-- Preserve existing accounts. These follow the numbering already used by this ERP.
insert into public.chart_of_accounts(code, name, type) values
  ('53', 'Caisse', 'actif'), ('4191', 'Avances clients sur commandes', 'passif'),
  ('511', 'Règlements en attente de remise', 'actif') on conflict (code) do nothing;

-- All operations remain subject to RLS, including the dynamic queries below.
create or replace function public.save_commercial_document(p_kind text, p_id uuid, p_header jsonb, p_lines jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_table text; v_lines text; v_fk text; v_price text; v_contact text; v_date text; v_extra text;
  v_id uuid := p_id; v_status text; v_requested text := coalesce(p_header->>'status','brouillon');
  v_line jsonb; v_position int := 0; v_contact_id uuid;
begin
  if not coalesce(public.is_active_user(),false) then raise exception 'Accès refusé'; end if;
  if p_kind = 'purchase_orders' then
    if public.current_role() not in ('admin','manager','purchasing') then raise exception 'Accès refusé'; end if;
  elsif public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Accès refusé'; end if;
  case p_kind
    when 'invoices' then v_table := 'invoices'; v_lines := 'invoice_lines'; v_fk := 'invoice_id'; v_date := 'issue_date'; v_extra := 'due_date';
    when 'sales_quotes' then v_table := 'sales_quotes'; v_lines := 'sales_quote_lines'; v_fk := 'quote_id'; v_date := 'quote_date'; v_extra := 'valid_until';
    when 'sales_orders' then v_table := 'sales_orders'; v_lines := 'sales_order_lines'; v_fk := 'order_id'; v_date := 'order_date';
    when 'purchase_orders' then v_table := 'purchase_orders'; v_lines := 'purchase_order_lines'; v_fk := 'po_id'; v_date := 'order_date'; v_extra := 'expected_date';
    else raise exception 'Type de document invalide';
  end case;
  v_price := case when p_kind = 'purchase_orders' then 'unit_cost' else 'unit_price' end;
  v_contact := case when p_kind = 'purchase_orders' then 'supplier_id' else 'contact_id' end;
  v_contact_id := nullif(p_header->>v_contact,'')::uuid;
  if v_contact_id is null then raise exception 'Choisissez un client ou fournisseur'; end if;
  if p_kind = 'invoices' and v_requested <> 'brouillon' then raise exception 'Enregistrez le brouillon avant de valider la facture'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 500 then raise exception 'Ajoutez entre 1 et 500 lignes'; end if;
  -- Validate before any deletion. An error anywhere rolls back the entire RPC.
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if coalesce(v_line->>'product_id','') = '' and btrim(coalesce(v_line->>'description','')) = '' then raise exception 'Produit ou description obligatoire'; end if;
    if (v_line->>'quantity')::numeric is null or (v_line->>'quantity')::numeric <= 0
      or (v_line->>'price')::numeric is null or (v_line->>'price')::numeric < 0
      or (v_line->>'tax_rate')::numeric is null or (v_line->>'tax_rate')::numeric not between 0 and 100
      or (v_line->>'quantity')::numeric::text in ('NaN','Infinity','-Infinity')
      or (v_line->>'price')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantité, prix ou TVA invalide'; end if;
  end loop;
  if v_id is not null then
    execute format('select status from public.%I where id=$1 for update',v_table) into v_status using v_id;
    if v_status is null then raise exception 'Document introuvable'; end if;
    if (p_kind = 'invoices' and v_status <> 'brouillon') or (p_kind = 'purchase_orders' and v_status = 'recue')
      or (p_kind = 'sales_orders' and v_status = 'facturee') then raise exception 'Document déjà comptabilisé ou converti, modification refusée'; end if;
    if p_kind = 'sales_orders' and exists(select 1 from public.invoices where order_id=v_id) then raise exception 'Commande déjà liée à une facture'; end if;
    if p_kind = 'sales_quotes' and exists(select 1 from public.sales_orders where quote_id=v_id) then raise exception 'Devis déjà converti'; end if;
    execute format('update public.%I set %I=$2, notes=$3, %I=$4 where id=$1',v_table,v_contact,v_date)
      using v_id,v_contact_id,p_header->>'notes',coalesce(nullif(p_header->>v_date,'')::date,current_date);
  else
    execute format('insert into public.%I (%I,notes,%I,created_by) values ($1,$2,$3,auth.uid()) returning id',v_table,v_contact,v_date)
      into v_id using v_contact_id,p_header->>'notes',coalesce(nullif(p_header->>v_date,'')::date,current_date);
  end if;
  if v_extra is not null then
    if nullif(p_header->>v_extra,'')::date < coalesce(nullif(p_header->>v_date,'')::date,current_date) then raise exception 'L''échéance précède la date du document'; end if;
    execute format('update public.%I set %I=$2 where id=$1',v_table,v_extra) using v_id,nullif(p_header->>v_extra,'')::date;
  end if;
  execute format('delete from public.%I where %I=$1',v_lines,v_fk) using v_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    execute format('insert into public.%I (%I,product_id,description,quantity,%I,tax_rate,position) values ($1,$2,$3,$4,$5,$6,$7)',v_lines,v_fk,v_price)
      using v_id,nullif(v_line->>'product_id','')::uuid,v_line->>'description',
        (v_line->>'quantity')::numeric,(v_line->>'price')::numeric,(v_line->>'tax_rate')::numeric,v_position;
    v_position := v_position + 1;
  end loop;
  -- Status last: totals/lines exist before any posting/receiving trigger runs.
  execute format('update public.%I set status=$2 where id=$1',v_table) using v_id,v_requested;
  return v_id;
end $$;
revoke all on function public.save_commercial_document(text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_commercial_document(text,uuid,jsonb,jsonb) to authenticated;

create or replace function public.convert_commercial_document(p_kind text,p_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_source record; v_id uuid; v_lines jsonb;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Accès refusé'; end if;
  if p_kind = 'quote' then
    select * into v_source from public.sales_quotes where id=p_id for update;
    if not found then raise exception 'Devis introuvable'; end if;
    select id into v_id from public.sales_orders where quote_id=p_id order by created_at limit 1;
    if v_id is not null then return v_id; end if;
    if v_source.status <> 'accepte' then raise exception 'Acceptez le devis avant conversion'; end if;
    select jsonb_agg(jsonb_build_object('product_id',product_id,'description',description,'quantity',quantity,'price',unit_price,'tax_rate',tax_rate) order by position)
      into v_lines from public.sales_quote_lines where quote_id=p_id;
    v_id := public.save_commercial_document('sales_orders',null,jsonb_build_object('contact_id',v_source.contact_id,'notes',v_source.notes),coalesce(v_lines,'[]'));
    update public.sales_orders set quote_id=p_id where id=v_id;
  elsif p_kind = 'order' then
    select * into v_source from public.sales_orders where id=p_id for update;
    if not found then raise exception 'Commande introuvable'; end if;
    select id into v_id from public.invoices where order_id=p_id and status <> 'annulee' order by created_at limit 1;
    if v_id is not null then return v_id; end if;
    if v_source.status not in ('confirmee','livree') then raise exception 'Confirmez la commande avant facturation'; end if;
    select jsonb_agg(jsonb_build_object('product_id',product_id,'description',description,'quantity',quantity,'price',unit_price,'tax_rate',tax_rate) order by position)
      into v_lines from public.sales_order_lines where order_id=p_id;
    v_id := public.save_commercial_document('invoices',null,jsonb_build_object('contact_id',v_source.contact_id,'notes',v_source.notes),coalesce(v_lines,'[]'));
    update public.invoices set order_id=p_id where id=v_id;
  else raise exception 'Conversion inconnue'; end if;
  return v_id;
end $$;
revoke all on function public.convert_commercial_document(text,uuid) from public,anon;
grant execute on function public.convert_commercial_document(text,uuid) to authenticated;

-- Lock the parent while editing lines so validation cannot race with a write.
create or replace function public.lock_invoice_lines_when_posted()
returns trigger language plpgsql set search_path=public as $$
declare v_status text; v_id uuid := coalesce(new.invoice_id,old.invoice_id);
begin
  if tg_op='UPDATE' and old.invoice_id is distinct from new.invoice_id then raise exception 'Une ligne ne peut pas changer de facture'; end if;
  select status into v_status from public.invoices where id=v_id for update;
  if v_status is not null and v_status <> 'brouillon' then raise exception 'Les lignes d''une facture validée sont figées'; end if;
  return coalesce(new,old);
end $$;

-- Protect posted headers as well as lines; paid status always follows actual payments.
create or replace function public.guard_invoice_integrity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_paid numeric; v_subtotal numeric(12,2); v_tax numeric(12,2);
begin
  if tg_op='INSERT' then
    if new.status <> 'brouillon' or new.amount_paid <> 0 or new.total <> 0 then raise exception 'Créez d''abord une facture brouillon'; end if;
    return new;
  end if;
  if old.status='annulee' and new.status is distinct from old.status then raise exception 'Une facture annulée ne peut pas être réactivée'; end if;
  if old.status <> 'brouillon' then
    if row(new.contact_id,new.order_id,new.number,new.issue_date,new.due_date,new.subtotal,new.tax_total,new.total,new.notes)
      is distinct from row(old.contact_id,old.order_id,old.number,old.issue_date,old.due_date,old.subtotal,old.tax_total,old.total,old.notes) then
      raise exception 'Le contenu d''une facture validée est figé';
    end if;
    if new.status not in ('validee','payee') and new.status is distinct from old.status then
      raise exception 'Annulation non disponible : une contre-écriture est nécessaire';
    end if;
  end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=new.id;
  if new.amount_paid is distinct from v_paid then raise exception 'Le montant payé est calculé depuis les règlements'; end if;
  if new.status='payee' and (v_paid < new.total or new.total <= 0) then raise exception 'Le solde doit être intégralement réglé'; end if;
  if old.status='brouillon' and new.status='validee' then
    select coalesce(sum(quantity*unit_price),0),coalesce(sum(quantity*unit_price*tax_rate/100),0) into v_subtotal,v_tax from public.invoice_lines where invoice_id=new.id;
    if row(new.subtotal,new.tax_total,new.total) is distinct from row(v_subtotal,v_tax,v_subtotal+v_tax) then raise exception 'Les montants ne correspondent pas aux lignes'; end if;
    if new.contact_id is null or new.total <= 0 or not exists(select 1 from public.invoice_lines where invoice_id=new.id) then raise exception 'Client et lignes de facture obligatoires, total strictement positif'; end if;
    if exists(select 1 from public.invoice_lines where invoice_id=new.id and (quantity <= 0 or unit_price < 0 or tax_rate not between 0 and 100)) then raise exception 'Lignes invalides'; end if;
    update public.sales_orders set status='facturee' where id=new.order_id;
  end if;
  return new;
end $$;
-- Les triggers sont posés de façon rejouable : la chaîne de migrations doit
-- pouvoir être rejouée sur une base déjà construite (voir README, reprise).
drop trigger if exists guard_invoice_integrity on public.invoices;
create trigger guard_invoice_integrity before insert or update on public.invoices for each row execute function public.guard_invoice_integrity();

-- Serialize concurrent payments on their parent. Reject invalid values and overpayments.
create or replace function public.guard_commercial_payment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_total numeric; v_paid numeric; v_status text; v_existing jsonb;
begin
  if tg_op <> 'INSERT' then raise exception 'Un règlement enregistré est immuable. Une contre-écriture est nécessaire'; end if;
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Accès refusé'; end if;
  if new.amount is null or new.amount <= 0 or new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Montant invalide'; end if;
  if tg_table_name='payments' then
    select total,status into v_total,v_status from public.invoices where id=new.invoice_id for update;
    if not found or v_status not in ('validee','payee') then raise exception 'Validez la facture avant encaissement'; end if;
    if new.request_id is not null then
      select to_jsonb(p) into v_existing from public.payments p where request_id=new.request_id;
      if v_existing is not null then
        if (v_existing->>'invoice_id')::uuid=new.invoice_id and (v_existing->>'amount')::numeric=new.amount and v_existing->>'method'=new.method then return null; end if;
        raise exception 'Identifiant de règlement déjà utilisé';
      end if;
    end if;
    select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=new.invoice_id;
    if new.paid_at > (now() at time zone 'Africa/Algiers')::date then raise exception 'Un encaissement ne peut pas être daté dans le futur'; end if;
    new.created_by := auth.uid();
  else
    select order_total into v_total from public.pipeline_orders where id=new.pipeline_order_id for update;
    if not found or v_total is null or v_total <= 0 then raise exception 'Fixez le montant de la commande avant encaissement'; end if;
    if new.payment_method not in ('cash','transfer','card','check','yalidine','other') then raise exception 'Mode de règlement invalide'; end if;
    if new.request_id is not null then
      select to_jsonb(p) into v_existing from public.order_payments p where request_id=new.request_id;
      if v_existing is not null then
        if (v_existing->>'pipeline_order_id')::uuid=new.pipeline_order_id and (v_existing->>'amount')::numeric=new.amount and v_existing->>'payment_method'=new.payment_method then return null; end if;
        raise exception 'Identifiant de règlement déjà utilisé';
      end if;
    end if;
    select coalesce(sum(amount),0) into v_paid from public.order_payments where pipeline_order_id=new.pipeline_order_id;
    new.recorded_by := auth.uid();
  end if;
  if v_paid + new.amount > v_total then raise exception 'Le règlement dépasse le reste à payer (%)',v_total-v_paid; end if;
  return new;
end $$;
drop trigger if exists guard_commercial_payment on public.payments;
create trigger guard_commercial_payment before insert or update or delete on public.payments for each row execute function public.guard_commercial_payment();
drop trigger if exists guard_commercial_payment on public.order_payments;
create trigger guard_commercial_payment before insert or update or delete on public.order_payments for each row execute function public.guard_commercial_payment();

-- Restrict direct financial writes too, not only server actions.
drop policy if exists payments_write on public.payments;
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
 with check(public.is_active_user() and public.current_role() in ('admin','manager','sales','accounting'));
drop policy if exists order_payments_insert on public.order_payments;
create policy order_payments_insert on public.order_payments for insert to authenticated
 with check(public.is_active_user() and public.current_role() in ('admin','manager','sales','accounting'));

create or replace function public.post_payment_journal()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_entry uuid; v_debit uuid; v_credit uuid; v_invoice public.invoices%rowtype; v_paid numeric;
begin
  select * into v_invoice from public.invoices where id=new.invoice_id;
  select id into v_debit from public.chart_of_accounts where code=case new.method when 'especes' then '53' when 'virement' then '512' else '511' end and is_active;
  select id into v_credit from public.chart_of_accounts where code='411' and is_active;
  if v_debit is null or v_credit is null then raise exception 'Comptes de règlement manquants ou inactifs'; end if;
  insert into public.journal_entries(entry_date,reference,description,source_type,source_id,created_by)
    values(new.paid_at,v_invoice.number,'Règlement facture '||v_invoice.number,'payment',new.id,new.created_by) returning id into v_entry;
  insert into public.journal_lines(entry_id,account_id,debit,credit,label) values
    (v_entry,v_debit,new.amount,0,'Encaissement'),(v_entry,v_credit,0,new.amount,'Règlement client');
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=new.invoice_id;
  update public.invoices set amount_paid=v_paid,status=case when v_paid>=total then 'payee' else 'validee' end where id=new.invoice_id;
  return new;
end $$;

create or replace function public.post_order_payment_journal()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_entry uuid; v_debit uuid; v_credit uuid; v_number text;
begin
  select number into v_number from public.pipeline_orders where id=new.pipeline_order_id;
  select id into v_debit from public.chart_of_accounts where code=case new.payment_method when 'cash' then '53' when 'transfer' then '512' else '511' end and is_active;
  select id into v_credit from public.chart_of_accounts where code='4191' and is_active;
  if v_debit is null or v_credit is null then raise exception 'Comptes de règlement manquants ou inactifs'; end if;
  insert into public.journal_entries(entry_date,reference,description,source_type,source_id,created_by)
    values((new.created_at at time zone 'Africa/Algiers')::date,v_number,'Avance commande '||v_number,'order_payment',new.id,new.recorded_by) returning id into v_entry;
  insert into public.journal_lines(entry_id,account_id,debit,credit,label) values
    (v_entry,v_debit,new.amount,0,'Encaissement commande'),(v_entry,v_credit,0,new.amount,'Avance client');
  return new;
end $$;

-- Cash movement = one balanced, atomic entry. Sales receipts use payment forms.
create or replace function public.record_cash_movement(p_amount numeric,p_direction text,p_account uuid,p_label text,p_date date,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_cash uuid; v_entry uuid;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','accounting') then raise exception 'Accès réservé à la comptabilité'; end if;
  if p_request_id is null then raise exception 'Identifiant obligatoire'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select id into v_entry from public.journal_entries where source_type='cash_manual' and source_id=p_request_id;
  if v_entry is not null then return v_entry; end if;
  if p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2) <> p_amount then raise exception 'Montant invalide'; end if;
  if p_direction is null or p_direction not in ('in','out') or length(btrim(coalesce(p_label,''))) < 3 then raise exception 'Sens et motif obligatoires'; end if;
  if p_date is null or p_date > (now() at time zone 'Africa/Algiers')::date then raise exception 'Date invalide'; end if;
  select id into v_cash from public.chart_of_accounts where code='53' and is_active;
  if v_cash is null then raise exception 'Compte caisse 53 manquant ou inactif'; end if;
  if not exists(select 1 from public.chart_of_accounts where id=p_account and is_active and code <> '53' and (code='512' or (type='charge' and p_direction='out'))) then raise exception 'Choisissez une charge pour une dépense, ou la banque pour un transfert'; end if;
  insert into public.journal_entries(entry_date,reference,description,source_type,source_id,created_by)
    values(p_date,'CAISSE',btrim(p_label),'cash_manual',p_request_id,auth.uid()) returning id into v_entry;
  insert into public.journal_lines(entry_id,account_id,debit,credit,label) values
    (v_entry,v_cash,case when p_direction='in' then p_amount else 0 end,case when p_direction='out' then p_amount else 0 end,p_label),
    (v_entry,p_account,case when p_direction='out' then p_amount else 0 end,case when p_direction='in' then p_amount else 0 end,p_label);
  return v_entry;
end $$;
revoke all on function public.record_cash_movement(numeric,text,uuid,text,date,uuid) from public,anon;
grant execute on function public.record_cash_movement(numeric,text,uuid,text,date,uuid) to authenticated;
revoke all on function public.guard_invoice_integrity() from public,anon,authenticated;
revoke all on function public.guard_commercial_payment() from public,anon,authenticated;
revoke all on function public.post_payment_journal() from public,anon,authenticated;
revoke all on function public.post_order_payment_journal() from public,anon,authenticated;

create or replace function public.invoice_receivables_summary(p_today date)
returns jsonb language sql security invoker set search_path=public as $$
  select jsonb_build_object(
    'outstanding',coalesce(sum(greatest(total-amount_paid,0)) filter(where status='validee'),0),
    'overdue',coalesce(sum(greatest(total-amount_paid,0)) filter(where status='validee' and due_date<p_today),0),
    'drafts',count(*) filter(where status='brouillon')
  ) from public.invoices;
$$;
revoke all on function public.invoice_receivables_summary(date) from public,anon;
grant execute on function public.invoice_receivables_summary(date) to authenticated;

create or replace function public.cash_book(p_from date,p_to date,p_offset int default 0)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_result jsonb;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Accès refusé'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_offset<0 then raise exception 'Période invalide'; end if;
  if not exists(select 1 from public.chart_of_accounts where code='53') then raise exception 'Compte caisse manquant'; end if;
  with movements as (
    select jl.id,je.entry_date,je.reference,je.description,jl.debit,jl.credit
    from public.journal_lines jl join public.chart_of_accounts a on a.id=jl.account_id
    join public.journal_entries je on je.id=jl.entry_id where a.code='53'
  ), period as (select * from movements where entry_date between p_from and p_to),
  page as (select * from period order by entry_date desc,id desc limit 50 offset p_offset)
  select jsonb_build_object(
    'opening',coalesce((select sum(debit-credit) from movements where entry_date<p_from),0),
    'incoming',coalesce((select sum(debit) from period),0),
    'outgoing',coalesce((select sum(credit) from period),0),
    'closing',coalesce((select sum(debit-credit) from movements where entry_date<=p_to),0),
    'count',(select count(*) from period),
    'rows',coalesce((select jsonb_agg(page order by entry_date desc,id desc) from page),'[]'::jsonb),
    'invoice_receipts',coalesce((select sum(amount) from public.payments where paid_at between p_from and p_to),0),
    'order_receipts',coalesce((select sum(amount) from public.order_payments where (created_at at time zone 'Africa/Algiers')::date between p_from and p_to),0)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.cash_book(date,date,int) from public,anon;
grant execute on function public.cash_book(date,date,int) to authenticated;

-- A direct update must not falsify order payment status or reduce a paid total.
create or replace function public.guard_order_financial_fields()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_paid numeric; v_status text;
begin
  if row(new.order_total,new.contact_id) is distinct from row(old.order_total,old.contact_id) then
    if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Modification financière non autorisée'; end if;
    select coalesce(sum(amount),0) into v_paid from public.order_payments where pipeline_order_id=new.id;
    if v_paid>0 and (new.order_total is null or new.order_total<v_paid or new.contact_id is distinct from old.contact_id) then raise exception 'Commande déjà réglée : client figé, total au moins égal aux règlements'; end if;
    if new.order_total<0 or new.order_total::text in ('NaN','Infinity','-Infinity') then raise exception 'Montant invalide'; end if;
  end if;
  if new.payment_status is distinct from old.payment_status then
    select coalesce(sum(amount),0) into v_paid from public.order_payments where pipeline_order_id=new.id;
    v_status:=case when v_paid<=0 then 'unpaid' when new.order_total>0 and v_paid>=new.order_total then 'paid' else 'partial' end;
    if new.payment_status is distinct from v_status then raise exception 'Le statut est calculé depuis les règlements'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_order_financial_fields on public.pipeline_orders;
create trigger guard_order_financial_fields before update on public.pipeline_orders for each row execute function public.guard_order_financial_fields();
revoke all on function public.guard_order_financial_fields() from public,anon,authenticated;
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_lines','sales_quotes','sales_quote_lines','sales_orders','sales_order_lines'] loop
    execute format('drop policy if exists %I on public.%I',t||'_write',t);
    execute format('create policy %I on public.%I for all to authenticated using(public.is_active_user() and public.current_role() in (''admin'',''manager'',''sales'',''accounting'')) with check(public.is_active_user() and public.current_role() in (''admin'',''manager'',''sales'',''accounting''))',t||'_write',t);
  end loop;
end $$;
