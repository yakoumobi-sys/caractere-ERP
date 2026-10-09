-- Operational preparation, least-privilege stock and daily cash counts.
alter table public.pipeline_orders
  add column due_date date,
  add column bat_status text not null default 'a_preparer' check(bat_status in ('a_preparer','envoye','valide','non_requis')),
  add column blocked_reason text,
  add column quality_checked boolean not null default false,
  add column packaging_checked boolean not null default false;
create index pipeline_orders_due_idx on public.pipeline_orders(due_date) where status<>'livree';

create or replace function public.save_order_preparation(p_order_id uuid,p_due_date date,p_bat_status text,p_blocked_reason text,p_quality boolean,p_packaging boolean)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','atelier') then raise exception 'Accès refusé'; end if;
  if p_bat_status is null or p_bat_status not in ('a_preparer','envoye','valide','non_requis') or length(coalesce(p_blocked_reason,''))>2000 then raise exception 'Préparation invalide'; end if;
  update public.pipeline_orders set due_date=p_due_date,bat_status=p_bat_status,blocked_reason=nullif(btrim(p_blocked_reason),''),quality_checked=coalesce(p_quality,false),packaging_checked=coalesce(p_packaging,false) where id=p_order_id;
  if not found then raise exception 'Commande introuvable'; end if;
end $$;
revoke all on function public.save_order_preparation(uuid,date,text,text,boolean,boolean) from public,anon;
grant execute on function public.save_order_preparation(uuid,date,text,text,boolean,boolean) to authenticated;

-- Remove permissive ALL policies (which otherwise override stricter INSERT policies).
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='stock_moves' and cmd<>'SELECT' loop
    execute format('drop policy %I on public.stock_moves',r.policyname);
  end loop;
end $$;
create policy stock_moves_insert on public.stock_moves for insert to authenticated
  with check(public.is_active_user() and public.current_role() in ('admin','manager','stock','purchasing'));

-- The ledger is append-only, including manual movements: correct via a new adjustment.
create or replace function public.guard_stock_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op<>'INSERT' then raise exception 'Journal de stock immuable : saisissez un ajustement motivé'; end if;
  if new.quantity is null or new.quantity=0 or new.quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantité de stock invalide'; end if;
  perform 1 from public.products where id=new.product_id for update;
  if new.pipeline_order_id is not null and pg_trigger_depth()<2 then raise exception 'La liaison atelier est réservée aux sorties automatiques'; end if;
  return new;
end $$;
create trigger guard_stock_ledger before insert or update or delete on public.stock_moves for each row execute function public.guard_stock_ledger();
revoke all on function public.guard_stock_ledger() from public,anon,authenticated;

create or replace function public.stock_transfer(p_product_id uuid,p_from_wh uuid,p_to_wh uuid,p_quantity numeric,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_available numeric;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','stock','purchasing') then raise exception 'Accès réservé à la gestion du stock'; end if;
  if p_from_wh is null or p_to_wh is null or p_from_wh=p_to_wh then raise exception 'Choisissez deux entrepôts différents'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantité invalide'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'Note trop longue'; end if;
  perform 1 from public.products where id=p_product_id and track_inventory and is_active for update;
  if not found then raise exception 'Article de stock introuvable ou inactif'; end if;
  select coalesce(sum(quantity),0) into v_available from public.stock_moves where product_id=p_product_id and warehouse_id=p_from_wh;
  if p_quantity>v_available then raise exception 'Stock disponible insuffisant : %',v_available; end if;
  insert into public.stock_moves(product_id,warehouse_id,quantity,type,reference,note,created_by) values
    (p_product_id,p_from_wh,-p_quantity,'transfert','Transfert',p_note,auth.uid()),
    (p_product_id,p_to_wh,p_quantity,'transfert','Transfert',p_note,auth.uid());
end $$;

create table public.cash_closures(
  id uuid primary key default gen_random_uuid(),
  closing_date date not null unique,
  expected_amount numeric(14,2) not null,
  counted_amount numeric(14,2) not null check(counted_amount>=0 and counted_amount::text not in ('NaN','Infinity','-Infinity')),
  difference numeric(14,2) generated always as (counted_amount-expected_amount) stored,
  note text,
  closed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.cash_closures enable row level security;
grant select on public.cash_closures to authenticated;
revoke all on public.cash_closures from anon;
create policy cash_closures_select on public.cash_closures for select to authenticated
  using(public.is_active_user() and public.current_role() in ('admin','manager','accounting'));

create or replace function public.close_cash_day(p_date date,p_counted numeric,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_expected numeric; v_id uuid; v_existing public.cash_closures%rowtype;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','accounting') then raise exception 'Clôture réservée à la comptabilité'; end if;
  -- A shared lock also serializes cash postings against a closure snapshot.
  perform pg_advisory_xact_lock(419153);
  select * into v_existing from public.cash_closures where closing_date=p_date;
  if found then
    if v_existing.counted_amount is distinct from p_counted or v_existing.note is distinct from nullif(btrim(p_note),'') then raise exception 'Journée déjà clôturée avec un autre comptage'; end if;
    return v_existing.id;
  end if;
  if p_date is null or p_date>(now() at time zone 'Africa/Algiers')::date or p_counted is null or p_counted<0 or p_counted::text in ('NaN','Infinity','-Infinity') or round(p_counted,2)<>p_counted then raise exception 'Date ou comptage invalide'; end if;
  if exists(select 1 from public.cash_closures where closing_date>=p_date) then raise exception 'Cette période est déjà clôturée'; end if;
  select coalesce(sum(jl.debit-jl.credit),0) into v_expected from public.journal_lines jl
    join public.chart_of_accounts a on a.id=jl.account_id and a.code='53'
    join public.journal_entries je on je.id=jl.entry_id where je.entry_date<=p_date;
  if not exists(select 1 from public.chart_of_accounts where code='53' and is_active) then raise exception 'Compte caisse manquant ou inactif'; end if;
  if p_counted<>v_expected and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Expliquez l’écart de caisse'; end if;
  if length(coalesce(p_note,''))>2000 then raise exception 'Note trop longue'; end if;
  insert into public.cash_closures(closing_date,expected_amount,counted_amount,note,closed_by)
    values(p_date,v_expected,p_counted,nullif(btrim(p_note),''),auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.close_cash_day(date,numeric,text) from public,anon;
grant execute on function public.close_cash_day(date,numeric,text) to authenticated;

create or replace function public.guard_closed_cash_day()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_date date;
begin
  if exists(select 1 from public.chart_of_accounts where id=new.account_id and code='53') then
    perform pg_advisory_xact_lock(419153);
    select entry_date into v_date from public.journal_entries where id=new.entry_id;
    if exists(select 1 from public.cash_closures where closing_date>=v_date) then raise exception 'Caisse clôturée : utilisez une date ouverte'; end if;
  end if;
  return new;
end $$;
create trigger guard_closed_cash_day before insert on public.journal_lines for each row execute function public.guard_closed_cash_day();
revoke all on function public.guard_closed_cash_day() from public,anon,authenticated;

create or replace function public.guard_closed_cash_edit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_closed date; v_entry uuid;
begin
  perform pg_advisory_xact_lock(419153);
  select max(closing_date) into v_closed from public.cash_closures;
  if v_closed is null then return coalesce(new,old); end if;
  if tg_table_name='journal_entries' then
    if (old.entry_date<=v_closed or (tg_op='UPDATE' and new.entry_date<=v_closed))
      and exists(select 1 from public.journal_lines jl join public.chart_of_accounts a on a.id=jl.account_id where jl.entry_id=old.id and a.code='53') then raise exception 'Écriture de caisse clôturée : modification interdite'; end if;
  else
    if exists(select 1 from public.chart_of_accounts where id=old.account_id and code='53') then
      select entry_date into v_closed from public.journal_entries where id=old.entry_id;
      if exists(select 1 from public.cash_closures where closing_date>=v_closed) then raise exception 'Ligne de caisse clôturée : modification interdite'; end if;
    end if;
    if tg_op='UPDATE' and exists(select 1 from public.chart_of_accounts where id=new.account_id and code='53') then
      select entry_date into v_closed from public.journal_entries where id=new.entry_id;
      if exists(select 1 from public.cash_closures where closing_date>=v_closed) then raise exception 'Ligne de caisse clôturée : modification interdite'; end if;
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger guard_closed_cash_edit before update or delete on public.journal_entries for each row execute function public.guard_closed_cash_edit();
create trigger guard_closed_cash_line_edit before update or delete on public.journal_lines for each row execute function public.guard_closed_cash_edit();
revoke all on function public.guard_closed_cash_edit() from public,anon,authenticated;

-- Restrictive policies combine with historical permissive SELECT/ALL policies.
do $$ declare t text; begin
  foreach t in array array['invoices','invoice_lines','payments','order_payments','sales_quotes','sales_quote_lines','sales_orders','sales_order_lines','journal_entries','journal_lines'] loop
    execute format('create policy financial_read_roles on public.%I as restrictive for select to authenticated using(public.is_active_user() and public.current_role() in (''admin'',''manager'',''sales'',''accounting''))',t);
  end loop;
end $$;

create or replace function public.guard_preparation_permissions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.due_date,new.bat_status,new.blocked_reason,new.quality_checked,new.packaging_checked)
    is distinct from row(old.due_date,old.bat_status,old.blocked_reason,old.quality_checked,old.packaging_checked)
    and (not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','atelier')) then raise exception 'Modification de préparation non autorisée'; end if;
  return new;
end $$;
create trigger guard_preparation_permissions before update on public.pipeline_orders for each row execute function public.guard_preparation_permissions();
revoke all on function public.guard_preparation_permissions() from public,anon,authenticated;

alter table public.contacts add column segment text check(segment in ('entreprise','pod','particulier','partenaire'));
alter table public.contacts add column acquisition_source text check(acquisition_source in ('whatsapp','instagram','facebook','site','salon','recommandation','prospection','autre'));

-- CRM debt includes standalone posted invoices and atelier balances once each.
-- Linked invoices use the atelier payment source, so never add them twice.
create or replace function public.recompute_contact_balance(p_contact_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_contact_id is null then return; end if;
  update public.contacts c set balance=
    coalesce((select sum(coalesce(order_total,0)) from public.pipeline_orders where contact_id=c.id),0)
    - coalesce((select sum(op.amount) from public.order_payments op join public.pipeline_orders po on po.id=op.pipeline_order_id where po.contact_id=c.id),0)
    + coalesce((select sum(total-amount_paid) from public.invoices where contact_id=c.id and pipeline_order_id is null and status in ('validee','payee')),0)
    where c.id=p_contact_id;
end $$;
revoke all on function public.recompute_contact_balance(uuid) from public,anon,authenticated;
create or replace function public.invoice_contact_balance_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.recompute_contact_balance(coalesce(new.contact_id,old.contact_id));
  if tg_op='UPDATE' and old.contact_id is distinct from new.contact_id then perform public.recompute_contact_balance(old.contact_id); end if;
  return coalesce(new,old);
end $$;
create trigger invoice_contact_balance_changed after insert or update or delete on public.invoices for each row execute function public.invoice_contact_balance_changed();
revoke all on function public.invoice_contact_balance_changed() from public,anon,authenticated;

-- Apply the same write matrix in the database as in lib/entity-permissions.ts.
do $$ declare r record; begin
  for r in select * from (values
    ('contacts','admin,manager,sales'),('opportunities','admin,manager,sales'),
    ('products','admin,manager,purchasing,sales,stock'),('product_categories','admin,manager,purchasing'),
    ('warehouses','admin,manager,stock,purchasing'),('suppliers','admin,manager,purchasing'),
    ('employees','admin,manager,hr'),('projects','admin,manager,sales'),('chart_of_accounts','admin,accounting')
  ) as matrix(table_name,roles) loop
    execute format('create policy entity_insert_roles on public.%I as restrictive for insert to authenticated with check(public.is_active_user() and public.current_role()::text=any(string_to_array(%L,'','')))',r.table_name,r.roles);
    execute format('create policy entity_update_roles on public.%I as restrictive for update to authenticated using(public.is_active_user() and public.current_role()::text=any(string_to_array(%L,'',''))) with check(public.is_active_user() and public.current_role()::text=any(string_to_array(%L,'','')))',r.table_name,r.roles,r.roles);
    execute format('create policy entity_delete_roles on public.%I as restrictive for delete to authenticated using(public.is_active_user() and public.current_role()::text=any(string_to_array(%L,'','')))',r.table_name,r.roles);
  end loop;
end $$;

-- Refresh a derived balance only; receipts and historical journal entries are untouched.
do $$ declare r record; begin
  for r in select id from public.contacts loop perform public.recompute_contact_balance(r.id); end loop;
end $$;
