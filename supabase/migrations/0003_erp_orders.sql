-- Caractère ERP v2 — devis, commandes, réservations, atelier, stock

create or replace function erp.line_qty(s jsonb) returns integer language sql immutable as $$
  select coalesce(sum(value::int), 0)::int from jsonb_each_text(coalesce(s, '{}'::jsonb)) where value ~ '^\d+$'
$$;

create or replace function erp.clean_sizes(s jsonb) returns jsonb language plpgsql immutable as $$
declare r record; out jsonb := '{}'::jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return out; end if;
  for r in select key, value from jsonb_each_text(s) loop
    if btrim(coalesce(r.value, '')) = '' then continue; end if;
    if btrim(r.value) !~ '^\d+$' then raise exception 'Quantité invalide pour la taille % : %', r.key, r.value; end if;
    if btrim(r.value)::int > 0 then out := out || jsonb_build_object(upper(btrim(r.key)), btrim(r.value)::int); end if;
  end loop;
  return out;
end $$;

create or replace function erp.line_amount(l erp.lines) returns numeric language sql immutable as $$
  select case when l.is_gift then 0 else round(erp.line_qty(l.sizes) * (l.unit_price + l.service_price) * (1 - l.discount_pct / 100), 2) end
$$;

create or replace function erp.check_line(l erp.lines) returns void language plpgsql as $$
declare maxw numeric := erp.setting_num('characterized_max_width_cm', 30); laize numeric;
begin
  if erp.line_qty(l.sizes) <= 0 then raise exception 'Ligne « % » : indiquez au moins une taille et une quantité.', l.label; end if;
  if l.is_characterized then
    if not ('dtf' = any(l.services)) then raise exception 'T-shirt caractérisé : la personnalisation se fait en DTF.'; end if;
    if l.print_width_cm is null or l.print_width_cm > maxw then
      raise exception 'T-shirt caractérisé : largeur d''impression maximale % cm (concept).', maxw;
    end if;
    if lower(coalesce(l.placement, '')) ~ '(col|manche|ourlet|bas)' then
      raise exception 'T-shirt caractérisé : impression localisée au-dessus de l''ourlet, col et manches unis.';
    end if;
  end if;
  if 'dtf' = any(l.services) and l.print_width_cm is not null then
    select max(laize_cm) into laize from erp.machines where kind = 'dtf' and active;
    if laize is not null and l.print_width_cm > laize then
      raise exception 'Largeur d''impression % cm supérieure à la laize DTF disponible (% cm).', l.print_width_cm, laize;
    end if;
  end if;
end $$;

create or replace function erp._insert_lines(p_quote uuid, p_order uuid, p_lines jsonb) returns void language plpgsql as $$
declare l jsonb; i int := 0; r erp.lines; v_label text;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    i := i + 1;
    select name into v_label from erp.products where id = nullif(l->>'product_id','')::uuid;
    insert into erp.lines(quote_id, order_id, position, product_id, label, color, sizes, unit_price, services, service_price,
                          discount_pct, placement, print_width_cm, is_characterized, is_gift, source_line_id)
    values (p_quote, p_order, i, nullif(l->>'product_id','')::uuid, coalesce(nullif(btrim(l->>'label'),''), v_label, 'Article'),
            coalesce(l->>'color', ''), erp.clean_sizes(l->'sizes'), coalesce(nullif(l->>'unit_price','')::numeric, 0),
            coalesce(array(select jsonb_array_elements_text(coalesce(l->'services', '[]'::jsonb))), '{}'),
            coalesce(nullif(l->>'service_price','')::numeric, 0), coalesce(nullif(l->>'discount_pct','')::numeric, 0),
            nullif(l->>'placement',''), nullif(l->>'print_width_cm','')::numeric,
            coalesce((l->>'is_characterized')::boolean, false), coalesce((l->>'is_gift')::boolean, false),
            nullif(l->>'source_line_id','')::uuid)
    returning * into r;
    perform erp.check_line(r);
  end loop;
end $$;

create or replace function erp.order_paid(o uuid) returns numeric language sql stable security definer set search_path = erp, pg_temp as $$
  select coalesce(sum(case when kind = 'remboursement' then -amount else amount end), 0)
  from erp.payments where order_id = o and status in ('confirme','encaisse_transporteur','rapproche')
    and (erp.can('money_view') or erp.can('shipping') or erp.can('orders_edit'))
$$;

create or replace function erp.recalc_order(o uuid) returns void language plpgsql as $$
declare ht numeric; rate numeric := case when erp.setting_text('tva_enabled','true') = 'true' then erp.setting_num('tva_rate', 19) else 0 end;
begin
  select coalesce(sum(erp.line_amount(l)), 0) into ht from erp.lines l where l.order_id = o;
  update erp.orders set total_ht = ht, total_tva = round(ht * rate / 100, 2), total_ttc = ht + round(ht * rate / 100, 2),
    deposit_required = round((ht + round(ht * rate / 100, 2)) * deposit_pct / 100, 0), updated_at = now()
  where id = o;
end $$;

create or replace function erp.quote_totals(q uuid) returns jsonb language sql stable security definer set search_path = erp, pg_temp as $$
  with t as (select coalesce(sum(erp.line_amount(l)), 0) ht from erp.lines l where l.quote_id = q),
       r as (select case when erp.setting_text('tva_enabled','true') = 'true' then erp.setting_num('tva_rate', 19) else 0 end rate)
  select jsonb_build_object('ht', t.ht, 'tva_rate', r.rate, 'tva', round(t.ht * r.rate / 100, 2), 'ttc', t.ht + round(t.ht * r.rate / 100, 2))
  from t, r
$$;

-- ============================ DEVIS ============================
create or replace function erp.save_quote(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales'); q record; v_id uuid := nullif(p->>'id','')::uuid; v_deal uuid := nullif(p->>'deal_id','')::uuid; v_client uuid := (p->>'client_id')::uuid;
begin
  if v_id is not null then
    select * into q from erp.quotes where id = v_id for update;
    if not found then raise exception 'Devis introuvable.'; end if;
    if q.status in ('accepte') then raise exception 'Devis accepté : modifiez la commande %.', q.ref; end if;
    update erp.quotes set promised_days = coalesce(nullif(p->>'promised_days','')::int, promised_days),
      deposit_pct = coalesce(nullif(p->>'deposit_pct','')::numeric, deposit_pct), notes = nullif(p->>'notes',''),
      owner_id = coalesce(nullif(p->>'owner_id','')::uuid, owner_id), updated_at = now()
    where id = v_id;
    delete from erp.lines where quote_id = v_id;
  else
    if v_client is null then raise exception 'Choisissez un client.'; end if;
    if v_deal is null then
      insert into erp.deals(client_id, title, stage, owner_id, next_action, next_action_date)
      values (v_client, coalesce(nullif(p->>'title',''), 'Devis'), 'a_qualifier', coalesce(nullif(p->>'owner_id','')::uuid, me), 'Envoyer le devis', erp.today())
      returning id into v_deal;
    end if;
    insert into erp.quotes(ref, client_id, deal_id, owner_id, promised_days, deposit_pct, valid_until, notes)
    values (erp.new_ref(), v_client, v_deal, coalesce(nullif(p->>'owner_id','')::uuid, me),
            coalesce(nullif(p->>'promised_days','')::int, erp.setting_num('default_promised_days', 7)::int),
            coalesce(nullif(p->>'deposit_pct','')::numeric, erp.setting_num('default_deposit_pct', 50)),
            erp.today() + erp.setting_num('quote_validity_days', 15)::int, nullif(p->>'notes',''))
    returning id into v_id;
    insert into erp.interactions(client_id, staff_id, kind, summary, quote_id)
    select v_client, me, 'devis', 'Devis ' || ref || ' créé', v_id from erp.quotes where id = v_id;
  end if;
  perform erp._insert_lines(v_id, null, p->'lines');
  if not exists (select 1 from erp.lines where quote_id = v_id) then raise exception 'Ajoutez au moins une ligne au devis.'; end if;
  return v_id;
end $$;

create or replace function erp.send_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales'); q record; d uuid; resend boolean;
begin
  select * into q from erp.quotes where id = p_id for update;
  if q.status not in ('brouillon','envoye') then raise exception 'Ce devis ne peut plus être envoyé (%).', q.status; end if;
  resend := exists (select 1 from erp.documents where quote_id = p_id and kind = 'devis' and status = 'emis');
  update erp.quotes set status = 'envoye', sent_at = now(), updated_at = now() where id = p_id;
  update erp.deals set stage = 'devis_envoye', next_action = 'Relancer le devis ' || q.ref,
    next_action_date = erp.today() + erp.setting_num('quote_followup_days', 3)::int, updated_at = now()
  where id = q.deal_id and stage not in ('gagne','perdu');
  insert into erp.interactions(client_id, staff_id, kind, summary, quote_id) values (q.client_id, me, 'devis', 'Devis ' || q.ref || ' envoyé', p_id);
  d := erp.issue_document('devis', null, p_id, null, null, case when resend then 'Devis modifié et renvoyé' end);
  return d;
end $$;

create or replace function erp.refuse_quote(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales'); q record;
begin
  if coalesce(btrim(p_reason),'') = '' then raise exception 'Indiquez le motif du refus.'; end if;
  select * into q from erp.quotes where id = p_id for update;
  if q.status = 'accepte' then raise exception 'Devis déjà accepté.'; end if;
  update erp.quotes set status = 'refuse', refused_reason = p_reason, updated_at = now() where id = p_id;
  update erp.deals set stage = 'perdu', lost_reason = p_reason, next_action = null, next_action_date = null where id = q.deal_id;
  update erp.followups set status = 'fait', result = 'Devis refusé : ' || p_reason, done_by = me, done_at = now() where quote_id = p_id and status = 'a_faire';
  insert into erp.interactions(client_id, staff_id, kind, summary, quote_id) values (q.client_id, me, 'devis', 'Devis ' || q.ref || ' refusé : ' || p_reason, p_id);
end $$;

-- Accepte et convertit un devis en commande. Rejouée, elle renvoie la commande existante.
create or replace function erp.convert_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales'); q record; c record; v uuid; v_kind text;
begin
  select * into q from erp.quotes where id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  select id into v from erp.orders where quote_id = p_id;
  if found then return v; end if;
  if q.status in ('refuse','expire') then raise exception 'Devis % : %, conversion impossible.', q.ref, q.status; end if;
  select * into c from erp.clients where id = q.client_id;
  v_kind := case when exists (select 1 from erp.lines where quote_id = p_id and cardinality(services) > 0) then 'personnalise' else 'vierge' end;
  insert into erp.orders(ref, client_id, quote_id, deal_id, kind, owner_id, promised_date, deposit_pct, bat_status,
                         ship_name, ship_phone, ship_wilaya, ship_commune, ship_address, logo_file_id, created_by)
  values (q.ref, q.client_id, q.id, q.deal_id, v_kind, coalesce(q.owner_id, me), erp.today() + q.promised_days, q.deposit_pct,
          case when v_kind = 'vierge' then 'sans_objet' else 'a_faire' end,
          c.name, c.phone, c.wilaya, c.commune, c.address,
          (select logo_file_id from erp.simulations where client_id = q.client_id and logo_file_id is not null order by created_at desc limit 1), me)
  returning id into v;
  perform erp._insert_lines(null, v, (
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'label', label, 'color', color, 'sizes', sizes, 'unit_price', unit_price,
      'services', to_jsonb(services), 'service_price', service_price, 'discount_pct', discount_pct, 'placement', placement,
      'print_width_cm', print_width_cm, 'is_characterized', is_characterized, 'is_gift', is_gift, 'source_line_id', id) order by position)
    from erp.lines where quote_id = p_id));
  perform erp.recalc_order(v);
  update erp.quotes set status = 'accepte', accepted_at = now(), updated_at = now() where id = p_id;
  update erp.deals set stage = 'gagne', next_action = null, next_action_date = null, updated_at = now() where id = q.deal_id;
  update erp.followups set status = 'fait', result = 'Devis accepté', done_by = me, done_at = now() where quote_id = p_id and status = 'a_faire';
  update erp.files set order_id = v where quote_id = p_id and order_id is null;
  perform erp.log_order(v, 'creation', null, jsonb_build_object('status','brouillon'), 'Commande créée depuis le devis ' || q.ref);
  insert into erp.interactions(client_id, staff_id, kind, summary, order_id, quote_id) values (q.client_id, me, 'commande', 'Devis ' || q.ref || ' accepté → commande', v, p_id);
  return v;
end $$;

-- ============================ COMMANDES ============================
create or replace function erp.create_order(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); v uuid; c record; v_kind text;
begin
  select * into c from erp.clients where id = (p->>'client_id')::uuid;
  if not found then raise exception 'Choisissez un client.'; end if;
  v_kind := coalesce(nullif(p->>'kind',''),
    case when exists (select 1 from jsonb_array_elements(coalesce(p->'lines','[]'::jsonb)) x where jsonb_array_length(coalesce(x->'services','[]'::jsonb)) > 0)
         then 'personnalise' else 'vierge' end);
  insert into erp.orders(ref, client_id, kind, owner_id, promised_date, deposit_pct, bat_status, delivery_mode,
                         ship_name, ship_phone, ship_wilaya, ship_commune, ship_address, notes, created_by)
  values (erp.new_ref(), c.id, v_kind, coalesce(nullif(p->>'owner_id','')::uuid, c.owner_id, me),
          coalesce(nullif(p->>'promised_date','')::date, erp.today() + erp.setting_num('default_promised_days', 7)::int),
          coalesce(nullif(p->>'deposit_pct','')::numeric, case when v_kind = 'vierge' then 100 else erp.setting_num('default_deposit_pct', 50) end),
          case when v_kind = 'vierge' then 'sans_objet' else 'a_faire' end, coalesce(nullif(p->>'delivery_mode',''), 'retrait'),
          c.name, c.phone, c.wilaya, c.commune, c.address, nullif(p->>'notes',''), me)
  returning id into v;
  perform erp._insert_lines(null, v, p->'lines');
  if not exists (select 1 from erp.lines where order_id = v) then raise exception 'Ajoutez au moins une ligne.'; end if;
  perform erp.recalc_order(v);
  perform erp.log_order(v, 'creation', null, jsonb_build_object('status','brouillon'), 'Commande créée au comptoir');
  insert into erp.interactions(client_id, staff_id, kind, summary, order_id)
  select c.id, me, 'commande', 'Commande ' || ref || ' créée', v from erp.orders where id = v;
  return v;
end $$;

create or replace function erp.replace_draft_lines(p_order uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record;
begin
  select * into o from erp.orders where id = p_order for update;
  if o.status <> 'brouillon' then raise exception 'Commande confirmée : modifiez les quantités ligne par ligne.'; end if;
  if exists (select 1 from erp.loyalty_benefits where used_order_id = p_order) and not exists (
    select 1 from jsonb_array_elements(p_lines) x where (x->>'is_gift')::boolean) then
    raise exception 'La ligne cadeau Carte Privilège doit être conservée.';
  end if;
  delete from erp.lines where order_id = p_order;
  perform erp._insert_lines(null, p_order, p_lines);
  perform erp.recalc_order(p_order);
  perform erp.log_order(p_order, 'lignes', null, null, 'Lignes du brouillon modifiées');
end $$;

create or replace function erp.update_order_meta(p_order uuid, p jsonb, p_reason text default null) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record;
begin
  select * into o from erp.orders where id = p_order for update;
  if o.status in ('annulee','livree','retiree') then raise exception 'Commande clôturée.'; end if;
  if p ? 'promised_date' and nullif(p->>'promised_date','')::date is distinct from o.promised_date then
    if o.status <> 'brouillon' and coalesce(btrim(p_reason),'') = '' then raise exception 'Indiquez le motif du changement de délai.'; end if;
    update erp.orders set promised_date = (p->>'promised_date')::date where id = p_order;
    perform erp.log_order(p_order, 'delai', jsonb_build_object('promised_date', o.promised_date), jsonb_build_object('promised_date', p->>'promised_date'), p_reason);
  end if;
  if p ? 'owner_id' and nullif(p->>'owner_id','')::uuid is distinct from o.owner_id then
    update erp.orders set owner_id = (p->>'owner_id')::uuid where id = p_order;
    perform erp.log_order(p_order, 'responsable', jsonb_build_object('owner_id', o.owner_id), jsonb_build_object('owner_id', p->>'owner_id'), p_reason);
  end if;
  if p ? 'delivery_mode' then
    update erp.orders set delivery_mode = p->>'delivery_mode', ship_name = coalesce(nullif(p->>'ship_name',''), ship_name),
      ship_phone = coalesce(erp.normalize_phone(p->>'ship_phone'), ship_phone), ship_wilaya = nullif(p->>'ship_wilaya',''),
      ship_commune = nullif(p->>'ship_commune',''), ship_address = nullif(p->>'ship_address',''),
      ship_stopdesk = coalesce((p->>'ship_stopdesk')::boolean, false)
    where id = p_order;
    if p->>'delivery_mode' is distinct from o.delivery_mode then
      perform erp.log_order(p_order, 'livraison', jsonb_build_object('mode', o.delivery_mode), jsonb_build_object('mode', p->>'delivery_mode'), p_reason);
    end if;
  end if;
  if p ? 'deposit_pct' and o.status = 'brouillon' then
    update erp.orders set deposit_pct = (p->>'deposit_pct')::numeric where id = p_order;
    perform erp.recalc_order(p_order);
  end if;
  if p ? 'notes' then update erp.orders set notes = nullif(p->>'notes','') where id = p_order; end if;
  update erp.orders set updated_at = now() where id = p_order;
end $$;

create or replace function erp.set_bat(p_order uuid, p_status text, p_file uuid default null) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record;
begin
  select * into o from erp.orders where id = p_order for update;
  update erp.orders set bat_status = p_status, bat_file_id = coalesce(p_file, bat_file_id),
    bat_validated_at = case when p_status = 'valide' then now() else null end, updated_at = now()
  where id = p_order;
  perform erp.log_order(p_order, 'bat', jsonb_build_object('bat', o.bat_status), jsonb_build_object('bat', p_status), null);
end $$;

create or replace function erp.set_agreement(p_order uuid, p_note text, p_file uuid default null) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit');
begin
  update erp.orders set agreement_note = coalesce(nullif(p_note,''), agreement_note), agreement_file_id = coalesce(p_file, agreement_file_id), updated_at = now() where id = p_order;
  perform erp.log_order(p_order, 'accord', null, jsonb_build_object('note', p_note, 'file', p_file), 'Preuve d''accord enregistrée');
end $$;

create or replace function erp.set_logo(p_order uuid, p_file uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit');
begin
  update erp.orders set logo_file_id = p_file, updated_at = now() where id = p_order;
end $$;

-- Réserve le stock disponible pour une ligne (complète les réservations existantes)
create or replace function erp.reserve_line(p_line uuid) returns integer language plpgsql as $$
declare l record; s record; it record; have int; need int; take int; missing int := 0;
begin
  select * into l from erp.lines where id = p_line;
  if l.product_id is null then return 0; end if;
  for s in select key size, value::int qty from jsonb_each_text(l.sizes) loop
    select coalesce(sum(qty), 0) into have from erp.reservations where line_id = p_line and size = s.size and status in ('active','consommee');
    need := s.qty - have;
    if need <= 0 then continue; end if;
    insert into erp.stock_items(product_id, color, size) values (l.product_id, l.color, s.size) on conflict do nothing;
    select * into it from erp.stock_items where product_id = l.product_id and color = l.color and size = s.size for update;
    take := least(need, it.physical - it.reserved);
    if take > 0 then
      insert into erp.reservations(order_id, line_id, item_id, size, qty) values (l.order_id, p_line, it.id, s.size, take);
      update erp.stock_items set reserved = reserved + take where id = it.id;
    end if;
    if need - greatest(take, 0) > 0 then
      missing := missing + need - greatest(take, 0);
      insert into erp.purchase_requests(item_id, qty, reason, order_id, requested_by)
      values (it.id, need - greatest(take, 0), 'Rupture pour la commande ' || (select ref from erp.orders where id = l.order_id), l.order_id, erp.me())
      on conflict (item_id) where status = 'a_valider' do update set qty = erp.purchase_requests.qty + excluded.qty,
        reason = erp.purchase_requests.reason || ' ; ' || excluded.reason;
    end if;
  end loop;
  return missing;
end $$;

-- Quantités manquantes par taille {"M": 3}
create or replace function erp.line_missing(p_line uuid) returns jsonb language sql stable security definer set search_path = erp, pg_temp as $$
  select coalesce(jsonb_object_agg(s.key, s.qty - coalesce(r.q, 0)) filter (where s.qty - coalesce(r.q, 0) > 0), '{}'::jsonb)
  from erp.lines l
  cross join lateral (select key, value::int qty from jsonb_each_text(l.sizes)) s
  left join lateral (select sum(qty) q from erp.reservations r where r.line_id = l.id and r.size = s.key and r.status in ('active','consommee')) r on true
  where l.id = p_line and l.product_id is not null
$$;

create or replace function erp.order_shortage(o uuid) returns integer language sql stable security definer set search_path = erp, pg_temp as $$
  select coalesce(sum(v::int), 0)::int from erp.lines l, jsonb_each_text(erp.line_missing(l.id)) x(k, v)
  where l.order_id = o
$$;

create or replace function erp.create_tasks(p_line uuid) returns void language plpgsql as $$
declare l record; steps text[]; st text; i int := 0; v_station text; v_assignee uuid; v_machine uuid; q int;
begin
  select * into l from erp.lines where id = p_line;
  q := erp.line_qty(l.sizes);
  if cardinality(l.services) = 0 then
    steps := array['preparation','controle','emballage'];
  else
    steps := array['preparation_fichier'];
    if 'dtf' = any(l.services) then steps := steps || array['impression_dtf','flocage'];
    elsif 'flocage' = any(l.services) then steps := steps || array['flocage']; end if;
    if 'broderie' = any(l.services) then steps := steps || array['broderie']; end if;
    steps := steps || array['controle','emballage'];
  end if;
  foreach st in array steps loop
    i := i + 1;
    v_station := case st when 'preparation_fichier' then 'infographie' when 'impression_dtf' then 'dtf' when 'flocage' then 'presse'
      when 'broderie' then 'broderie' when 'preparation' then 'magasin' when 'controle' then 'controle' else 'emballage' end;
    v_assignee := case st when 'preparation_fichier' then erp.least_loaded('infographiste') when 'impression_dtf' then erp.least_loaded('infographiste')
      when 'flocage' then erp.least_loaded('floqueur') when 'broderie' then erp.least_loaded('brodeur')
      when 'preparation' then erp.least_loaded('magasinier') when 'controle' then erp.least_loaded('controleur') else null end;
    v_machine := case st
      when 'impression_dtf' then (select id from erp.machines where kind = 'dtf' and active and (l.print_width_cm is null or laize_cm >= l.print_width_cm) order by laize_cm limit 1)
      when 'flocage' then (select id from erp.machines where kind = 'presse' and active order by name limit 1)
      when 'broderie' then (select id from erp.machines where kind = 'brodeuse' and active order by name limit 1) end;
    insert into erp.tasks(order_id, line_id, step, seq, station, assignee_id, machine_id, qty_target, needs_first_piece)
    values (l.order_id, p_line, st, i, v_station, v_assignee, v_machine, q, st in ('flocage','broderie'))
    on conflict (line_id, step) do nothing;
  end loop;
end $$;

-- Confirmation : un seul passage même en cas de double clic (verrou + contrôle du statut)
create or replace function erp.confirm_order(p_id uuid, p_waive_reason text default null) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record; paid numeric; l record; personalized boolean;
begin
  select * into o from erp.orders where id = p_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status <> 'brouillon' then return o.status; end if;
  if not exists (select 1 from erp.lines where order_id = p_id) then raise exception 'La commande ne contient aucune ligne.'; end if;
  personalized := exists (select 1 from erp.lines where order_id = p_id and cardinality(services) > 0);
  if personalized and o.bat_status not in ('valide','sans_objet') then raise exception 'Le BAT doit être validé par le client avant la confirmation.'; end if;
  if personalized and o.agreement_file_id is null and coalesce(btrim(o.agreement_note),'') = '' then
    raise exception 'Ajoutez la preuve d''accord du client (capture WhatsApp, signature ou note).';
  end if;
  paid := erp.order_paid(p_id);
  if paid < o.deposit_required then
    if coalesce(btrim(p_waive_reason),'') = '' then
      raise exception 'Acompte insuffisant : % DA reçus sur % DA requis.', paid, o.deposit_required;
    end if;
    if not erp.can('waive_deposit') then raise exception 'Seul le gérant peut confirmer sans l''acompte prévu.'; end if;
    update erp.orders set deposit_waived_reason = p_waive_reason where id = p_id;
  end if;
  update erp.orders set status = 'confirmee', confirmed_at = now(), confirmed_by = me, updated_at = now() where id = p_id;
  for l in select id from erp.lines where order_id = p_id order by position loop
    perform erp.reserve_line(l.id);
    perform erp.create_tasks(l.id);
  end loop;
  update erp.clients set kind = 'client', updated_at = now() where id = o.client_id and kind = 'prospect';
  perform erp.log_order(p_id, 'confirmation', jsonb_build_object('status','brouillon'), jsonb_build_object('status','confirmee', 'manquant', erp.order_shortage(p_id)), p_waive_reason);
  return 'confirmee';
end $$;

create or replace function erp.release_reservations(p_line uuid, p_size text, p_qty int) returns int language plpgsql as $$
declare r record; left_ int := p_qty; take int;
begin
  for r in select * from erp.reservations where line_id = p_line and size = p_size and status = 'active' order by created_at desc for update loop
    exit when left_ <= 0;
    take := least(r.qty, left_);
    update erp.stock_items set reserved = reserved - take where id = r.item_id;
    if take = r.qty then update erp.reservations set status = 'liberee', closed_at = now() where id = r.id;
    else update erp.reservations set qty = qty - take where id = r.id; end if;
    left_ := left_ - take;
  end loop;
  return p_qty - left_;
end $$;

-- Modification de quantité après confirmation : réservations et tâches recalculées, historique conservé
create or replace function erp.update_line_sizes(p_line uuid, p_sizes jsonb, p_reason text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); l erp.lines; o record; newsizes jsonb; oldsizes jsonb; s text; newq int; rq int; cq int; released int;
        started boolean; paid numeric; v_notes text := ''; t record;
begin
  select * into l from erp.lines where id = p_line;
  select * into o from erp.orders where id = l.order_id for update;
  if o.status in ('expediee','a_retirer','livree','retiree','annulee','retournee') then raise exception 'Modification impossible : commande %.', o.status; end if;
  newsizes := erp.clean_sizes(p_sizes);
  oldsizes := l.sizes;
  if o.status <> 'brouillon' and coalesce(btrim(p_reason),'') = '' then raise exception 'Indiquez le motif de la modification.'; end if;
  update erp.lines set sizes = newsizes where id = p_line returning * into l;
  perform erp.check_line(l);
  perform erp.recalc_order(o.id);
  if o.status = 'brouillon' then
    perform erp.log_order(o.id, 'quantite', jsonb_build_object('line', l.label, 'sizes', oldsizes), jsonb_build_object('line', l.label, 'sizes', newsizes), p_reason);
    return;
  end if;
  -- réservations : libérer l'excédent, compléter le manque
  for s in select distinct size from erp.reservations where line_id = p_line and status in ('active','consommee')
           union select key from jsonb_each_text(newsizes) loop
    select coalesce(sum(qty) filter (where status = 'active'), 0), coalesce(sum(qty) filter (where status = 'consommee'), 0)
      into rq, cq from erp.reservations where line_id = p_line and size = s;
    newq := coalesce((newsizes->>s)::int, 0);
    if rq + cq > newq then
      released := erp.release_reservations(p_line, s, least(rq, rq + cq - newq));
      if cq > newq then v_notes := v_notes || format('%s pièce(s) %s déjà remise(s) à l''atelier en trop. ', cq - newq, s); end if;
    end if;
  end loop;
  perform erp.reserve_line(p_line);
  newq := erp.line_qty(newsizes);
  started := exists (select 1 from erp.tasks where line_id = p_line and started_at is not null and step not in ('preparation_fichier'));
  update erp.tasks set qty_target = newq where line_id = p_line and status in ('a_faire','en_cours','bloquee');
  for t in select * from erp.tasks where line_id = p_line and status = 'terminee' and qty_target < newq loop
    update erp.tasks set status = 'a_faire', qty_target = newq, finished_at = null, finished_by = null,
      first_piece_status = case when needs_first_piece then 'validee' else 'na' end where id = t.id;
    insert into erp.task_log(task_id, staff_id, action, note) values (t.id, me, 'reouverte', format('Quantité portée à %s : %s', newq, p_reason));
  end loop;
  if started then v_notes := v_notes || 'Production commencée : reprise à traiter. '; end if;
  if o.status = 'prete' and exists (select 1 from erp.tasks where order_id = o.id and status not in ('terminee','annulee')) then
    update erp.orders set status = 'en_production', ready_at = null where id = o.id;
  end if;
  paid := erp.order_paid(o.id);
  select * into o from erp.orders where id = o.id;
  if paid > o.total_ttc then
    update erp.orders set refund_due = paid - o.total_ttc where id = o.id;
    v_notes := v_notes || format('Trop-perçu de %s DA à rembourser. ', paid - o.total_ttc);
    insert into erp.followups(client_id, order_id, owner_id, due_date, reason, note)
    values (o.client_id, o.id, o.owner_id, erp.today(), 'remboursement', format('Rembourser %s DA (%s)', paid - o.total_ttc, o.ref)) on conflict do nothing;
  end if;
  if v_notes <> '' then update erp.orders set rework_note = btrim(coalesce(rework_note || ' ', '') || v_notes) where id = o.id; end if;
  perform erp.log_order(o.id, 'quantite', jsonb_build_object('line', l.label, 'sizes', oldsizes), jsonb_build_object('line', l.label, 'sizes', newsizes, 'a_traiter', nullif(v_notes,'')), p_reason);
end $$;

create or replace function erp.cancel_order(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record; r record; consumed int; started boolean; paid numeric; v_notes text := '';
begin
  if coalesce(btrim(p_reason),'') = '' then raise exception 'Indiquez le motif de l''annulation.'; end if;
  select * into o from erp.orders where id = p_id for update;
  if o.status = 'annulee' then return; end if;
  if o.status in ('livree','retiree') then raise exception 'Commande déjà remise : enregistrez un retour.'; end if;
  for r in select distinct line_id, size from erp.reservations where order_id = p_id and status = 'active' loop
    perform erp.release_reservations(r.line_id, r.size, 1000000);
  end loop;
  select coalesce(sum(qty), 0) into consumed from erp.reservations where order_id = p_id and status = 'consommee';
  started := exists (select 1 from erp.tasks where order_id = p_id and started_at is not null and step <> 'preparation_fichier');
  update erp.tasks set status = 'annulee' where order_id = p_id and status in ('a_faire','en_cours','bloquee');
  update erp.payments set status = 'annule', note = coalesce(note || ' ; ', '') || 'Commande annulée' where order_id = p_id and status = 'attendu';
  paid := erp.order_paid(p_id);
  if consumed > 0 then v_notes := v_notes || format('%s article(s) déjà remis à l''atelier : réintégrer ou passer en perte. ', consumed); end if;
  if started then v_notes := v_notes || 'Production commencée : pièces à traiter. '; end if;
  if paid > 0 then v_notes := v_notes || format('Acompte de %s DA à rembourser ou à convertir. ', paid); end if;
  update erp.orders set status = 'annulee', cancel_reason = p_reason, refund_due = greatest(paid, 0),
    rework_note = nullif(btrim(coalesce(rework_note || ' ', '') || v_notes), ''), updated_at = now() where id = p_id;
  if paid > 0 then
    insert into erp.followups(client_id, order_id, owner_id, due_date, reason, note)
    values (o.client_id, p_id, o.owner_id, erp.today(), 'remboursement', format('Annulation %s : %s DA à rembourser', o.ref, paid)) on conflict do nothing;
  end if;
  perform erp.log_order(p_id, 'annulation', jsonb_build_object('status', o.status), jsonb_build_object('status','annulee', 'a_rembourser', paid), p_reason);
end $$;

create or replace function erp.set_order_block(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record;
begin
  select * into o from erp.orders where id = p_id for update;
  update erp.orders set blocked_reason = nullif(btrim(p_reason),''), updated_at = now() where id = p_id;
  perform erp.log_order(p_id, case when nullif(btrim(p_reason),'') is null then 'deblocage' else 'blocage' end,
    jsonb_build_object('blocked', o.blocked_reason), jsonb_build_object('blocked', nullif(btrim(p_reason),'')), p_reason);
end $$;

-- ============================ STOCK ============================
create or replace function erp.consume_line_stock(p_line uuid, p_kind text) returns int language plpgsql as $$
declare r record; n int := 0; v_ref text;
begin
  select o.ref into v_ref from erp.lines l join erp.orders o on o.id = l.order_id where l.id = p_line;
  for r in select * from erp.reservations where line_id = p_line and status = 'active' for update loop
    update erp.stock_items set physical = physical - r.qty, reserved = reserved - r.qty where id = r.item_id;
    update erp.reservations set status = 'consommee', closed_at = now() where id = r.id;
    insert into erp.stock_moves(item_id, qty, kind, order_id, reason, staff_id)
    values (r.item_id, -r.qty, p_kind, r.order_id, case when p_kind = 'sortie_atelier' then 'Remise à l''atelier ' else 'Remise au client ' end || v_ref, erp.me());
    n := n + r.qty;
  end loop;
  return n;
end $$;

create or replace function erp.issue_order_stock(p_order uuid) returns int
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid; l record; n int := 0;
begin
  if not (erp.can('stock_edit') or erp.can('workshop_work')) then raise exception 'Accès refusé (stock).'; end if;
  perform 1 from erp.orders where id = p_order and status in ('confirmee','en_production','prete') for update;
  if not found then raise exception 'Commande non confirmée.'; end if;
  for l in select id from erp.lines where order_id = p_order loop n := n + erp.consume_line_stock(l.id, 'sortie_atelier'); end loop;
  return n;
end $$;

create or replace function erp.upsert_product(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('stock_edit'); v uuid;
begin
  insert into erp.products(ref, name, kind, unit, sale_price, cost)
  values (upper(btrim(p->>'ref')), btrim(p->>'name'), coalesce(nullif(p->>'kind',''), 'vetement'), coalesce(nullif(p->>'unit',''), 'pièce'),
          coalesce(nullif(p->>'sale_price','')::numeric, 0), case when erp.can('cost_view') then coalesce(nullif(p->>'cost','')::numeric, 0) else 0 end)
  on conflict (ref) do update set name = coalesce(nullif(btrim(excluded.name),''), erp.products.name), kind = excluded.kind, unit = excluded.unit,
    sale_price = case when p ? 'sale_price' then excluded.sale_price else erp.products.sale_price end,
    cost = case when erp.can('cost_view') and p ? 'cost' then excluded.cost else erp.products.cost end
  returning id into v;
  return v;
end $$;

create or replace function erp.upsert_stock_item(p_product uuid, p_color text, p_size text, p_threshold int) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('stock_edit'); v uuid;
begin
  insert into erp.stock_items(product_id, color, size, alert_threshold) values (p_product, coalesce(btrim(p_color),''), upper(coalesce(btrim(p_size),'')), coalesce(p_threshold, 5))
  on conflict (product_id, color, size) do update set alert_threshold = coalesce(p_threshold, erp.stock_items.alert_threshold)
  returning id into v;
  return v;
end $$;

-- Après une entrée de stock : complète les réservations en attente (commandes confirmées, par délai promis)
create or replace function erp.fill_pending_reservations(p_item uuid) returns int language plpgsql as $$
declare it record; ln record; n int := 0;
begin
  select * into it from erp.stock_items where id = p_item;
  for ln in select l.id from erp.lines l join erp.orders o on o.id = l.order_id
           where o.status in ('confirmee','en_production') and l.product_id = it.product_id and l.color = it.color and l.sizes ? it.size
             and (erp.line_missing(l.id) ? it.size)
           order by o.promised_date nulls last, o.confirmed_at loop
    perform erp.reserve_line(ln.id); n := n + 1;
  end loop;
  -- les demandes d'achat devenues inutiles sont soldées
  update erp.purchase_requests pr set status = 'recue', decided_at = coalesce(decided_at, now())
  where pr.item_id = p_item and pr.status = 'validee';
  return n;
end $$;

create or replace function erp.stock_move(p_item uuid, p_kind text, p_qty int, p_reason text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('stock_edit'); it record; delta int;
begin
  if coalesce(btrim(p_reason),'') = '' then raise exception 'Le motif est obligatoire.'; end if;
  select * into it from erp.stock_items where id = p_item for update;
  if not found then raise exception 'Article de stock introuvable.'; end if;
  delta := case p_kind when 'reception' then abs(p_qty) when 'retour' then abs(p_qty) when 'perte' then -abs(p_qty)
                       when 'inventaire' then p_qty - it.physical when 'correction' then p_qty else null end;
  if delta is null then raise exception 'Type de mouvement inconnu.'; end if;
  if it.physical + delta < it.reserved then
    raise exception 'Stock physique (%) inférieur au réservé (%) : libérez des réservations d''abord.', it.physical + delta, it.reserved;
  end if;
  if delta <> 0 then
    update erp.stock_items set physical = physical + delta where id = p_item;
    insert into erp.stock_moves(item_id, qty, kind, reason, staff_id) values (p_item, delta, p_kind, p_reason, me);
  end if;
  if delta > 0 then perform erp.fill_pending_reservations(p_item); end if;
end $$;

create or replace function erp.request_purchase(p_item uuid, p_qty int, p_reason text) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('purchase_request'); v uuid;
begin
  insert into erp.purchase_requests(item_id, qty, reason, requested_by) values (p_item, p_qty, p_reason, me)
  on conflict (item_id) where status = 'a_valider' do update set qty = excluded.qty, reason = excluded.reason
  returning id into v;
  return v;
end $$;

create or replace function erp.decide_purchase(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('purchase_approve');
begin
  update erp.purchase_requests set status = case when p_approve then 'validee' else 'refusee' end, decided_by = me, decided_at = now()
  where id = p_id and status = 'a_valider';
end $$;

-- ============================ ATELIER ============================
create or replace function erp._task_guard(t erp.tasks) returns void language plpgsql as $$
declare o record; prev text;
begin
  select * into o from erp.orders where id = t.order_id;
  if o.status not in ('confirmee','en_production','prete') then raise exception 'Commande % : %.', o.ref, o.status; end if;
  select string_agg(step, ', ') into prev from erp.tasks where line_id = t.line_id and seq < t.seq and status not in ('terminee','annulee');
  if prev is not null then raise exception 'Étape précédente non terminée : %.', prev; end if;
end $$;

create or replace function erp.start_task(p_id uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); t erp.tasks; miss jsonb; o record;
begin
  select * into t from erp.tasks where id = p_id for update;
  if not found then raise exception 'Tâche introuvable.'; end if;
  if t.status = 'en_cours' then return; end if;
  if t.status in ('terminee','annulee') then raise exception 'Tâche déjà %.', t.status; end if;
  if t.status = 'bloquee' then raise exception 'Tâche bloquée (%) : débloquez-la d''abord.', t.blocked_reason; end if;
  select * into o from erp.orders where id = t.order_id for update;
  if o.blocked_reason is not null then raise exception 'Commande bloquée : %.', o.blocked_reason; end if;
  perform erp._task_guard(t);
  if t.step in ('impression_dtf','flocage','broderie','preparation') then
    miss := erp.line_missing(t.line_id);
    if miss <> '{}'::jsonb then raise exception 'Rupture de stock, mise en production bloquée. Manque : %', miss::text; end if;
  end if;
  if t.step in ('flocage','broderie','preparation') then perform erp.consume_line_stock(t.line_id, 'sortie_atelier'); end if;
  update erp.tasks set status = 'en_cours', started_by = me, started_at = now(), assignee_id = coalesce(assignee_id, me),
    first_piece_status = case when needs_first_piece and first_piece_status <> 'validee' then 'a_valider' else first_piece_status end
  where id = p_id;
  insert into erp.task_log(task_id, staff_id, action) values (p_id, me, 'demarrer');
  if o.status = 'confirmee' then
    update erp.orders set status = 'en_production', updated_at = now() where id = o.id;
    perform erp.log_order(o.id, 'statut', jsonb_build_object('status','confirmee'), jsonb_build_object('status','en_production'), 'Première tâche démarrée');
  end if;
end $$;

create or replace function erp.validate_first_piece(p_id uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); t erp.tasks;
begin
  if not (erp.can('settings') or exists (select 1 from erp.staff where id = me and can_validate_first_piece)) then
    raise exception 'Seule une personne habilitée peut valider la première pièce.';
  end if;
  select * into t from erp.tasks where id = p_id for update;
  if t.status <> 'en_cours' or t.first_piece_status <> 'a_valider' then raise exception 'Aucune première pièce à valider sur cette tâche.'; end if;
  if not p_ok and coalesce(btrim(p_note),'') = '' then raise exception 'Indiquez le défaut constaté.'; end if;
  update erp.tasks set first_piece_status = case when p_ok then 'validee' else 'refusee' end, first_piece_by = me, first_piece_at = now() where id = p_id;
  insert into erp.task_log(task_id, staff_id, action, note) values (p_id, me, case when p_ok then 'premiere_piece_validee' else 'premiere_piece_refusee' end, p_note);
end $$;

create or replace function erp.resubmit_first_piece(p_id uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work');
begin
  update erp.tasks set first_piece_status = 'a_valider' where id = p_id and first_piece_status = 'refusee' and status = 'en_cours';
  insert into erp.task_log(task_id, staff_id, action) values (p_id, me, 'premiere_piece_representee');
end $$;

create or replace function erp.finish_task(p_id uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); t erp.tasks; flocker uuid; o record;
begin
  select * into t from erp.tasks where id = p_id for update;
  if t.status = 'terminee' then return; end if;
  if t.status <> 'en_cours' then raise exception 'Démarrez la tâche avant de la terminer.'; end if;
  if t.needs_first_piece and t.first_piece_status <> 'validee' then
    raise exception 'Première pièce non validée : la série ne peut pas être lancée ni terminée.';
  end if;
  if t.step = 'controle' then
    select finished_by into flocker from erp.tasks where line_id = t.line_id and step = 'flocage';
    if flocker is not null and flocker = me then
      raise exception 'Contrôle croisé : le contrôle doit être fait par un autre membre que le floqueur.';
    end if;
  end if;
  select * into o from erp.orders where id = t.order_id for update;
  update erp.tasks set status = 'terminee', qty_done = qty_target, rework_pending = 0, finished_by = me, finished_at = now() where id = p_id;
  insert into erp.task_log(task_id, staff_id, action) values (p_id, me, 'terminer');
  if t.step = 'emballage' then update erp.lines set produced = t.qty_target where id = t.line_id; end if;
  if o.status in ('confirmee','en_production')
     and not exists (select 1 from erp.tasks where order_id = o.id and status not in ('terminee','annulee')) then
    update erp.orders set status = 'prete', ready_at = now(), updated_at = now() where id = o.id;
    perform erp.log_order(o.id, 'statut', jsonb_build_object('status', o.status), jsonb_build_object('status','prete'), 'Toutes les pièces contrôlées et emballées');
  end if;
end $$;

create or replace function erp.block_task(p_id uuid, p_reason text, p_notify uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid;
begin
  if not (erp.can('workshop_work') or erp.can('orders_edit')) then raise exception 'Accès refusé (atelier).'; end if;
  me := erp.me();
  if coalesce(btrim(p_reason),'') = '' then raise exception 'Indiquez le motif du blocage.'; end if;
  update erp.tasks set status = 'bloquee', blocked_reason = p_reason, blocked_by = me, blocked_at = now(), notify_staff_id = p_notify
  where id = p_id and status in ('a_faire','en_cours');
  if not found then raise exception 'Tâche non bloquable.'; end if;
  insert into erp.task_log(task_id, staff_id, action, note) values (p_id, me, 'bloquer', p_reason);
end $$;

create or replace function erp.unblock_task(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid;
begin
  if not (erp.can('workshop_work') or erp.can('orders_edit')) then raise exception 'Accès refusé (atelier).'; end if;
  me := erp.me();
  update erp.tasks set status = case when started_at is null then 'a_faire' else 'en_cours' end, blocked_reason = null, notify_staff_id = null
  where id = p_id and status = 'bloquee';
  insert into erp.task_log(task_id, staff_id, action, note) values (p_id, me, 'debloquer', p_note);
end $$;

create or replace function erp.set_task_priority(p_id uuid, p_priority int, p_note text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('priority');
begin
  if coalesce(btrim(p_note),'') = '' then raise exception 'Indiquez la raison de la priorité.'; end if;
  update erp.tasks set priority = p_priority, priority_note = p_note where id = p_id;
  insert into erp.task_log(task_id, staff_id, action, note) values (p_id, me, 'priorite', format('Priorité %s : %s', p_priority, p_note));
end $$;

create or replace function erp.assign_task(p_id uuid, p_assignee uuid, p_machine uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid; t erp.tasks; l erp.lines; m record;
begin
  if not (erp.can('workshop_work') or erp.can('priority')) then raise exception 'Accès refusé (atelier).'; end if;
  me := erp.me();
  select * into t from erp.tasks where id = p_id for update;
  select * into l from erp.lines where id = t.line_id;
  if p_machine is not null then
    select * into m from erp.machines where id = p_machine;
    if m.kind = 'dtf' and l.print_width_cm is not null and m.laize_cm < l.print_width_cm then
      raise exception 'Laize de % (% cm) insuffisante pour une impression de % cm.', m.name, m.laize_cm, l.print_width_cm;
    end if;
  end if;
  update erp.tasks set assignee_id = p_assignee, machine_id = p_machine where id = p_id;
  insert into erp.task_log(task_id, staff_id, action, note) values (p_id, me, 'affecter',
    coalesce((select full_name from erp.staff where id = p_assignee), '—') || ' / ' || coalesce(m.name, '—'));
end $$;

create or replace function erp.report_defect(p_task uuid, p_size text, p_qty int, p_defect text, p_outcome text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); t erp.tasks; l erp.lines; it record; v_ref text;
begin
  if coalesce(btrim(p_defect),'') = '' then raise exception 'Décrivez le défaut.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantité invalide.'; end if;
  select * into t from erp.tasks where id = p_task for update;
  select * into l from erp.lines where id = t.line_id;
  select ref into v_ref from erp.orders where id = t.order_id;
  insert into erp.defects(task_id, order_id, line_id, size, qty, defect, outcome, staff_id)
  values (p_task, t.order_id, t.line_id, upper(coalesce(p_size,'')), p_qty, p_defect, p_outcome, me);
  if p_outcome = 'perte' and l.product_id is not null then
    select * into it from erp.stock_items where product_id = l.product_id and color = l.color and size = upper(coalesce(p_size,'')) for update;
    if found and it.physical - it.reserved >= p_qty then
      update erp.stock_items set physical = physical - p_qty where id = it.id;
      insert into erp.stock_moves(item_id, qty, kind, order_id, reason, staff_id)
      values (it.id, -p_qty, 'perte', t.order_id, format('Pièce ratée %s : %s — remplacée', v_ref, p_defect), me);
    else
      update erp.tasks set rework_pending = rework_pending + p_qty where id = p_task;
      if found then
        insert into erp.purchase_requests(item_id, qty, reason, order_id, requested_by)
        values (it.id, p_qty, format('Remplacement pièce ratée %s', v_ref), t.order_id, me)
        on conflict (item_id) where status = 'a_valider' do update set qty = erp.purchase_requests.qty + excluded.qty;
      end if;
    end if;
  else
    update erp.tasks set rework_pending = rework_pending + p_qty where id = p_task;
  end if;
  insert into erp.task_log(task_id, staff_id, action, note) values (p_task, me, 'defaut', format('%s × %s %s : %s (%s)', p_qty, l.label, p_size, p_defect, p_outcome));
end $$;
