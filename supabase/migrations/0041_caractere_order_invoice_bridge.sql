-- 0041: explicit atelier/invoice relationship, one stock exit and one receipt source.
-- No historical matching by name/amount, no deletion or journal rewriting.
-- 0037 references paid_at but never created it on an empty database.
alter table public.pipeline_orders add column if not exists paid_at timestamptz;
alter table public.invoices add column pipeline_order_id uuid references public.pipeline_orders(id) on delete restrict;
create unique index invoices_pipeline_order_unique on public.invoices(pipeline_order_id) where pipeline_order_id is not null;

create or replace function public.create_pipeline_invoice(p_order_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_order public.pipeline_orders%rowtype; v_id uuid; v_description text;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Accès refusé'; end if;
  select * into v_order from public.pipeline_orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  select id into v_id from public.invoices where pipeline_order_id=p_order_id;
  if v_id is not null then return v_id; end if;
  if v_order.order_total is null or v_order.order_total<=0 then raise exception 'Fixez le montant TTC de la commande avant facturation'; end if;
  select string_agg(quantity::text || ' × ' || product_name || coalesce(' / '||color,'') || coalesce(' / '||size,''), E'\n' order by position,id)
    into v_description from public.pipeline_order_items where pipeline_order_id=p_order_id;
  if v_description is null then raise exception 'Ajoutez les articles avant facturation'; end if;
  -- There are no negotiated unit prices in the legacy atelier model.
  -- Use an explicit global draft rather than inventing prices or a VAT rate.
  v_id:=public.save_commercial_document('invoices',null,
    jsonb_build_object('contact_id',v_order.contact_id,'issue_date',(now() at time zone 'Africa/Algiers')::date,'notes','Commande atelier '||v_order.number||E'\nBrouillon au tarif global : vérifier les lignes et la fiscalité avant validation.'),
    jsonb_build_array(jsonb_build_object('product_id',null,'description','Lot personnalisé — '||v_order.number||E'\n'||v_description,'quantity',1,'price',v_order.order_total,'tax_rate',0)));
  update public.invoices set pipeline_order_id=p_order_id where id=v_id;
  return v_id;
end $$;
revoke all on function public.create_pipeline_invoice(uuid) from public,anon;
grant execute on function public.create_pipeline_invoice(uuid) to authenticated;
create or replace function public.guard_invoice_integrity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_order public.pipeline_orders%rowtype; v_paid numeric; v_subtotal numeric(12,2); v_tax numeric(12,2);
begin
  if new.pipeline_order_id is not null then
    select * into v_order from public.pipeline_orders where id=new.pipeline_order_id for update;
    if not found or new.contact_id is distinct from v_order.contact_id then raise exception 'Client de facture différent de la commande'; end if;
    if new.order_id is not null then raise exception 'Une facture ne peut appartenir à deux circuits'; end if;
    if tg_op='UPDATE' and new.status in ('validee','payee') and new.total is distinct from v_order.order_total then
      raise exception 'Le total TTC doit correspondre au montant de la commande';
    end if;
  end if;
  if tg_op='UPDATE' and new.pipeline_order_id is distinct from old.pipeline_order_id and not (old.pipeline_order_id is null and old.status='brouillon' and new.status='brouillon' and not exists(select 1 from public.payments where invoice_id=new.id)) then raise exception 'La liaison atelier est figée'; end if;
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
  if new.pipeline_order_id is null then
    select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=new.id;
  else
    select coalesce(sum(amount),0) into v_paid from public.order_payments where pipeline_order_id=new.pipeline_order_id;
    -- Advances are attributed only after posting, never on an editable draft.
    if new.status='brouillon' then v_paid:=0; end if;
  end if;
  if not (old.status='brouillon' and new.status='validee' and new.pipeline_order_id is not null and new.amount_paid=0) and new.amount_paid is distinct from v_paid then raise exception 'Le montant payé est calculé depuis les règlements'; end if;
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

create or replace function public.guard_commercial_payment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_total numeric; v_paid numeric; v_status text; v_existing jsonb;
begin
  if tg_op <> 'INSERT' then raise exception 'Un règlement enregistré est immuable. Une contre-écriture est nécessaire'; end if;
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager','sales','accounting') then raise exception 'Accès refusé'; end if;
  if new.amount is null or new.amount <= 0 or new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Montant invalide'; end if;
  if tg_table_name='payments' then
    select total,status into v_total,v_status from public.invoices where id=new.invoice_id for update;
    if exists(select 1 from public.invoices where id=new.invoice_id and pipeline_order_id is not null) then raise exception 'Encaissez sur la commande atelier liée à cette facture'; end if;
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

create or replace function public.post_invoice_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry_id uuid;
  v_acc_client uuid;
  v_acc_vente uuid;
  v_acc_tva uuid; v_advance uuid; v_paid numeric; v_allocation uuid;
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

    if new.pipeline_order_id is null and exists(select 1 from public.invoice_lines il join public.products p on p.id=il.product_id where il.invoice_id=new.id and p.track_inventory)
      and not exists(select 1 from public.warehouses where is_default) then raise exception 'Configurez un entrepôt par défaut avant de facturer des articles en stock'; end if;
    insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, created_by)
    select il.product_id,
           (select id from public.warehouses where is_default limit 1),
           -il.quantity,
           'sortie',
           new.number,
           new.created_by
    from public.invoice_lines il
    join public.products p on p.id = il.product_id
    where il.invoice_id = new.id and p.track_inventory and new.pipeline_order_id is null
      and (select id from public.warehouses where is_default limit 1) is not null;
    if new.pipeline_order_id is not null then
      select coalesce(sum(amount),0) into v_paid from public.order_payments where pipeline_order_id=new.pipeline_order_id;
      if v_paid>0 then
        select id into v_advance from public.chart_of_accounts where code='4191' and is_active;
        if v_advance is null then raise exception 'Compte avances clients manquant'; end if;
        insert into public.journal_entries(entry_date,reference,description,source_type,source_id,created_by)
          values(new.issue_date,new.number,'Imputation des avances atelier','order_advance_allocation',new.id,auth.uid()) returning id into v_allocation;
        insert into public.journal_lines(entry_id,account_id,debit,credit,label) values
          (v_allocation,v_advance,v_paid,0,'Avances imputées'),(v_allocation,v_acc_client,0,v_paid,'Règlement de facture par avances');
      end if;
      update public.invoices set amount_paid=v_paid,status=case when v_paid>=total then 'payee' else 'validee' end where id=new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.post_order_payment_journal()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_entry uuid; v_debit uuid; v_credit uuid; v_number text;
begin
  select number into v_number from public.pipeline_orders where id=new.pipeline_order_id;
  select id into v_debit from public.chart_of_accounts where code=case new.payment_method when 'cash' then '53' when 'transfer' then '512' else '511' end and is_active;
  select id into v_credit from public.chart_of_accounts where code=case when exists(select 1 from public.invoices where pipeline_order_id=new.pipeline_order_id and status in ('validee','payee')) then '411' else '4191' end and is_active;
  if v_debit is null or v_credit is null then raise exception 'Comptes de règlement manquants ou inactifs'; end if;
  insert into public.journal_entries(entry_date,reference,description,source_type,source_id,created_by)
    values((new.created_at at time zone 'Africa/Algiers')::date,v_number,'Avance commande '||v_number,'order_payment',new.id,new.recorded_by) returning id into v_entry;
  insert into public.journal_lines(entry_id,account_id,debit,credit,label) values
    (v_entry,v_debit,new.amount,0,'Encaissement commande'),(v_entry,v_credit,0,new.amount,'Avance client');
  return new;
end $$;

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

  update public.invoices set amount_paid=v_paid,status=case when v_paid>=total then 'payee' else 'validee' end
    where pipeline_order_id=p_order_id and status in ('validee','payee');
  perform public.recompute_contact_balance(v_contact);
end;
$$;
-- Protect physical and financial evidence against deletion or later editing.
create or replace function public.guard_pipeline_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if tg_table_name='pipeline_orders' then
    v_id:=old.id;
    if tg_op='UPDATE' then
      if row(new.order_total,new.contact_id) is not distinct from row(old.order_total,old.contact_id) then return new; end if;
      if exists(select 1 from public.invoices where pipeline_order_id=v_id and status<>'brouillon') then raise exception 'Client et total figés après facturation'; end if;
      return new;
    end if;
    if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','manager') then raise exception 'Suppression réservée à la direction'; end if;
    if exists(select 1 from public.order_payments where pipeline_order_id=v_id)
      or exists(select 1 from public.invoices where pipeline_order_id=v_id)
      or exists(select 1 from public.stock_moves where pipeline_order_id=v_id)
      or old.status='livree' then raise exception 'Commande avec historique financier ou livraison : suppression interdite'; end if;
    return old;
  end if;
  v_id:=coalesce(new.pipeline_order_id,old.pipeline_order_id);
  perform 1 from public.pipeline_orders where id=v_id for update;
  if tg_op='UPDATE' and new.pipeline_order_id is distinct from old.pipeline_order_id then raise exception 'Une ligne ne peut pas changer de commande'; end if;
  if exists(select 1 from public.stock_moves where pipeline_order_id=v_id)
    or exists(select 1 from public.pipeline_orders where id=v_id and status='livree')
    or exists(select 1 from public.invoices where pipeline_order_id=v_id and status<>'brouillon') then raise exception 'Articles figés après livraison ou facturation'; end if;
  return coalesce(new,old);
end $$;
create trigger guard_pipeline_evidence before update or delete on public.pipeline_orders for each row execute function public.guard_pipeline_evidence();
create trigger guard_pipeline_item_evidence before insert or update or delete on public.pipeline_order_items for each row execute function public.guard_pipeline_evidence();
revoke all on function public.guard_pipeline_evidence() from public,anon,authenticated;

create or replace function public.inventory_out_on_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_default_wh uuid;
  v_already int;
begin
  if new.status is distinct from 'livree' or old.status is not distinct from 'livree' then
    return new;
  end if;

  select id into v_default_wh from public.warehouses where is_default limit 1;
  if v_default_wh is null then
    if exists(select 1 from public.pipeline_order_items i join public.products p on p.id=i.product_id where i.pipeline_order_id=new.id and p.track_inventory) then raise exception 'Configurez un entrepôt par défaut avant la livraison'; end if;
    return new;
  end if;

  -- Un aller-retour de statut (livrée -> prête -> livrée) ne doit pas sortir
  -- la marchandise deux fois.
  select count(*) into v_already
  from public.stock_moves
  where pipeline_order_id = new.id and type = 'sortie';
  if v_already > 0 then
    return new;
  end if;

  insert into public.stock_moves (product_id, warehouse_id, quantity, type, reference, note, pipeline_order_id, created_by)
  select cible.id,
         v_default_wh,
         -abs(i.quantity),
         'sortie',
         new.number,
         'Livraison — ' || i.product_name,
         new.id,
         auth.uid()
  from public.pipeline_order_items i
  -- La clé catalogue d'abord ; le nom normalisé ne sert que pour les lignes
  -- antérieures à 0035, et de façon déterministe (la plus ancienne fiche).
  cross join lateral (
    select coalesce(
      i.product_id,
      (select p.id
         from public.products p
        where lower(trim(p.name)) = lower(trim(i.product_name))
        order by p.created_at
        limit 1)
    ) as id
  ) resolu
  join public.products cible on cible.id = resolu.id and cible.track_inventory
  where i.pipeline_order_id = new.id
    and i.quantity > 0;

  return new;
end $$;
