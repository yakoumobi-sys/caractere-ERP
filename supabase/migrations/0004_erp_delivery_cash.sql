-- Caractère ERP v2 — livraisons, Yalidine, fidélité, règlements, caisse, documents, comptoir, imports

-- ============================ DOCUMENTS (figés) ============================
create or replace function erp.build_snapshot(p_kind text, p_order uuid, p_quote uuid, p_shipment uuid, p_payment uuid) returns jsonb
language plpgsql as $$
declare v_order uuid := p_order; o record; q record; c record; snap jsonb; lines jsonb; totals jsonb; pays jsonb; sh record;
begin
  if p_kind = 'devis' then
    select * into q from erp.quotes where id = p_quote;
    select * into c from erp.clients where id = q.client_id;
    select jsonb_agg(jsonb_build_object('label', label, 'color', color, 'sizes', sizes, 'qty', erp.line_qty(sizes), 'unit_price', unit_price,
      'service_price', service_price, 'services', to_jsonb(services), 'discount_pct', discount_pct, 'placement', placement,
      'is_gift', is_gift, 'amount', erp.line_amount(l)) order by position) into lines from erp.lines l where quote_id = p_quote;
    totals := erp.quote_totals(p_quote);
    snap := jsonb_build_object('ref', q.ref, 'valid_until', q.valid_until, 'promised_days', q.promised_days, 'deposit_pct', q.deposit_pct,
      'notes', q.notes, 'lines', lines, 'totals', totals);
  else
    if p_shipment is not null then select order_id into v_order from erp.shipments where id = p_shipment; end if;
    if p_payment is not null then select order_id into v_order from erp.payments where id = p_payment; end if;
    select * into o from erp.orders where id = v_order;
    select * into c from erp.clients where id = o.client_id;
    select jsonb_agg(jsonb_build_object('label', label, 'color', color, 'sizes', sizes, 'qty', erp.line_qty(sizes), 'unit_price', unit_price,
      'service_price', service_price, 'services', to_jsonb(services), 'discount_pct', discount_pct, 'placement', placement,
      'is_gift', is_gift, 'amount', erp.line_amount(l)) order by position) into lines from erp.lines l where order_id = v_order;
    select jsonb_agg(jsonb_build_object('at', at, 'method', method, 'kind', kind, 'amount', amount, 'status', status, 'receipt', receipt_number) order by at)
      into pays from erp.payments where order_id = v_order and status <> 'annule';
    snap := jsonb_build_object('ref', o.ref, 'promised_date', o.promised_date, 'lines', lines, 'payments', coalesce(pays, '[]'::jsonb),
      'totals', jsonb_build_object('ht', o.total_ht, 'tva_rate', case when o.total_ht > 0 then round(o.total_tva * 100 / o.total_ht, 2) else 0 end,
        'tva', o.total_tva, 'ttc', o.total_ttc, 'paid', erp.order_paid(v_order), 'balance', o.total_ttc - erp.order_paid(v_order)),
      'delivery', jsonb_build_object('mode', o.delivery_mode, 'name', o.ship_name, 'phone', o.ship_phone, 'wilaya', o.ship_wilaya, 'commune', o.ship_commune, 'address', o.ship_address));
    if p_kind = 'bon_livraison' then
      select * into sh from erp.shipments where id = p_shipment;
      snap := snap || jsonb_build_object('shipment', jsonb_build_object('number', sh.number, 'mode', sh.mode, 'tracking', sh.tracking, 'cod_amount', sh.cod_amount,
        'items', (select jsonb_agg(jsonb_build_object('label', l.label, 'color', l.color, 'size', sl.size, 'qty', sl.qty) order by l.position, sl.size)
                  from erp.shipment_lines sl join erp.lines l on l.id = sl.line_id where sl.shipment_id = p_shipment)));
    end if;
    if p_kind = 'recu' then
      snap := snap || jsonb_build_object('payment', (select jsonb_build_object('at', at, 'method', method, 'kind', kind, 'amount', amount, 'receipt', receipt_number)
                                                     from erp.payments where id = p_payment));
    end if;
  end if;
  return snap || jsonb_build_object(
    'company', coalesce(erp.setting('company'), '{}'::jsonb),
    'client', jsonb_build_object('name', c.name, 'company', c.company, 'phone', c.phone, 'address', c.address, 'commune', c.commune, 'wilaya', c.wilaya),
    'legal_mentions', erp.setting('legal_mentions'));
end $$;

create or replace function erp.issue_document(p_kind text, p_order uuid, p_quote uuid, p_shipment uuid, p_payment uuid, p_reason text default null) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.me(); ex record; v uuid; num text; prefix text; o record; snap jsonb;
begin
  if not (erp.can('sales') or erp.can('payment_record') or erp.can('shipping')) then raise exception 'Accès refusé (documents).'; end if;
  if p_kind = 'facture' then
    select * into o from erp.orders where id = p_order for update;
    if o.status in ('brouillon','annulee') then raise exception 'Facture possible uniquement pour une commande confirmée.'; end if;
    select * into ex from erp.documents where order_id = p_order and kind = 'facture' and status = 'emis' for update;
  elsif p_kind = 'devis' then
    perform 1 from erp.quotes where id = p_quote for update;
    select * into ex from erp.documents where quote_id = p_quote and kind = 'devis' and status = 'emis' for update;
  elsif p_kind = 'bon_livraison' then
    perform 1 from erp.shipments where id = p_shipment for update;
    select * into ex from erp.documents where shipment_id = p_shipment and kind = 'bon_livraison' and status = 'emis' for update;
  else
    select * into ex from erp.documents where payment_id = p_payment and kind = 'recu' and status = 'emis' for update;
  end if;
  if ex.id is not null and coalesce(btrim(p_reason),'') = '' then return ex.id; end if;  -- idempotent
  snap := erp.build_snapshot(p_kind, p_order, p_quote, p_shipment, p_payment);
  if ex.id is not null then
    update erp.documents set status = 'remplace' where id = ex.id;
    num := regexp_replace(ex.number, '-v\d+$', '') || '-v' || (ex.version + 1);
  else
    prefix := case p_kind when 'devis' then erp.setting_text('prefix_devis','DEV') when 'facture' then erp.setting_text('prefix_facture','FAC')
                          when 'bon_livraison' then erp.setting_text('prefix_bl','BL') else erp.setting_text('prefix_recu','REC') end;
    num := prefix || '-' || to_char(erp.today(), 'YYYY') || '-' || lpad(erp.next_counter('doc-' || prefix || '-' || to_char(erp.today(), 'YYYY'))::text, 4, '0');
  end if;
  insert into erp.documents(kind, number, version, order_id, quote_id, shipment_id, payment_id, replaces_id, correction_reason, snapshot, total_ttc, issued_by)
  values (p_kind, num, coalesce(ex.version, 0) + 1,
          coalesce(p_order, (select order_id from erp.shipments where id = p_shipment), (select order_id from erp.payments where id = p_payment),
                   (select id from erp.orders where quote_id = p_quote)),
          p_quote, p_shipment, p_payment, ex.id, nullif(btrim(p_reason),''), snap, (snap->'totals'->>'ttc')::numeric, me)
  returning id into v;
  return v;
end $$;

create or replace function erp.documents_frozen() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Document émis : suppression interdite.'; end if;
  if new.snapshot is distinct from old.snapshot or new.number is distinct from old.number or new.kind is distinct from old.kind
     or new.issued_at is distinct from old.issued_at or (old.status = 'remplace' and new.status <> 'remplace') then
    raise exception 'Document émis : il est figé. Émettez une correction.';
  end if;
  return new;
end $$;
drop trigger if exists documents_frozen on erp.documents;
create trigger documents_frozen before update or delete on erp.documents for each row execute function erp.documents_frozen();

-- ============================ RÈGLEMENTS & CAISSE ============================
create or replace function erp.open_session_locked() returns uuid language sql as $$
  select id from erp.cash_sessions where closed_at is null for update
$$;

create or replace function erp.record_payment(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('payment_record'); o record; v uuid; key text := nullif(p->>'idempotency_key',''); amt numeric := (p->>'amount')::numeric;
        m text := p->>'method'; bal numeric; sess uuid; k text;
begin
  select * into o from erp.orders where id = (p->>'order_id')::uuid for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if key is not null then
    select id into v from erp.payments where idempotency_key = key;
    if found then return v; end if;
  end if;
  if o.status in ('annulee') then raise exception 'Commande annulée : aucun encaissement possible.'; end if;
  if amt is null or amt <= 0 then raise exception 'Montant invalide.'; end if;
  if m not in ('especes','ccp','baridimob','virement','cheque','tpe') then raise exception 'Mode de paiement invalide.'; end if;
  bal := o.total_ttc - erp.order_paid(o.id)
         - coalesce((select sum(amount) from erp.payments where order_id = o.id and status = 'attendu'), 0);
  if amt > bal + 0.001 then raise exception 'Montant supérieur au reste à payer (% DA).', bal; end if;
  if m = 'especes' then
    sess := erp.open_session_locked();
    if sess is null then raise exception 'Ouvrez la caisse avant d''encaisser des espèces.'; end if;
  end if;
  k := case when o.status = 'brouillon' then 'acompte' when amt >= bal - 0.001 then 'solde' else 'paiement' end;
  insert into erp.payments(order_id, client_id, kind, method, amount, status, cash_session_id, receipt_number, idempotency_key, note, staff_id)
  values (o.id, o.client_id, k, m, amt, 'confirme', sess,
          erp.setting_text('prefix_recu','REC') || '-' || to_char(erp.today(),'YY') || '-' || lpad(erp.next_counter('receipt-' || to_char(erp.today(),'YY'))::text, 5, '0'),
          key, nullif(p->>'note',''), me)
  returning id into v;
  if m = 'especes' then
    insert into erp.cash_moves(session_id, kind, amount, payment_id, label, staff_id)
    values (sess, 'encaissement', amt, v, initcap(k) || ' ' || o.ref, me);
  end if;
  perform erp.log_order(o.id, 'paiement', null, jsonb_build_object('amount', amt, 'method', m, 'kind', k), null);
  perform erp.issue_document('recu', null, null, null, v, null);
  return v;
end $$;

create or replace function erp.record_refund(p_order uuid, p_amount numeric, p_method text, p_reason text, p_key text) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('payment_record'); o record; v uuid; sess uuid;
begin
  select * into o from erp.orders where id = p_order for update;
  if p_key is not null then select id into v from erp.payments where idempotency_key = p_key; if found then return v; end if; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'Motif du remboursement obligatoire.'; end if;
  if p_amount <= 0 or p_amount > erp.order_paid(p_order) then raise exception 'Montant de remboursement invalide.'; end if;
  if p_method = 'especes' then
    sess := erp.open_session_locked();
    if sess is null then raise exception 'Ouvrez la caisse pour rembourser en espèces.'; end if;
  end if;
  insert into erp.payments(order_id, client_id, kind, method, amount, status, cash_session_id, idempotency_key, note, staff_id)
  values (p_order, o.client_id, 'remboursement', p_method, p_amount, 'confirme', sess, p_key, p_reason, me) returning id into v;
  if sess is not null then
    insert into erp.cash_moves(session_id, kind, amount, payment_id, label, staff_id) values (sess, 'remboursement', -p_amount, v, 'Remboursement ' || o.ref, me);
  end if;
  update erp.orders set refund_due = greatest(refund_due - p_amount, 0) where id = p_order;
  if (select refund_due from erp.orders where id = p_order) = 0 then
    update erp.followups set status = 'fait', result = 'Remboursé', done_by = me, done_at = now() where order_id = p_order and reason = 'remboursement' and status = 'a_faire';
  end if;
  perform erp.log_order(p_order, 'remboursement', null, jsonb_build_object('amount', p_amount, 'method', p_method), p_reason);
  return v;
end $$;

create or replace function erp.open_cash(p_float numeric) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('cash'); v uuid;
begin
  select id into v from erp.cash_sessions where closed_at is null;
  if found then return v; end if;
  begin
    insert into erp.cash_sessions(opened_by, opening_float) values (me, coalesce(p_float, 0)) returning id into v;
  exception when unique_violation then
    select id into v from erp.cash_sessions where closed_at is null; return v;
  end;
  insert into erp.cash_moves(session_id, kind, amount, label, staff_id) values (v, 'fond', coalesce(p_float, 0), 'Fond de caisse', me);
  return v;
end $$;

create or replace function erp.cash_out(p_kind text, p_amount numeric, p_label text) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('cash'); sess uuid; v uuid;
begin
  if p_kind not in ('depense','retrait') then raise exception 'Type invalide.'; end if;
  if coalesce(btrim(p_label),'') = '' or p_amount is null or p_amount <= 0 then raise exception 'Montant et libellé obligatoires.'; end if;
  sess := erp.open_session_locked();
  if sess is null then raise exception 'Aucune caisse ouverte.'; end if;
  insert into erp.cash_moves(session_id, kind, amount, label, staff_id) values (sess, p_kind, -p_amount, p_label, me) returning id into v;
  return v;
end $$;

create or replace function erp.close_cash(p_counted numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('cash'); s record; exp numeric;
begin
  select * into s from erp.cash_sessions where closed_at is null for update;
  if not found then raise exception 'Aucune caisse ouverte.'; end if;
  select coalesce(sum(amount), 0) into exp from erp.cash_moves where session_id = s.id;
  if p_counted <> exp and coalesce(btrim(p_note),'') = '' then raise exception 'Écart de % DA : justifiez-le dans la note.', p_counted - exp; end if;
  update erp.cash_sessions set closed_at = now(), closed_by = me, expected_cash = exp, counted_cash = p_counted, gap = p_counted - exp, close_note = p_note where id = s.id;
  return jsonb_build_object('expected', exp, 'counted', p_counted, 'gap', p_counted - exp);
end $$;

create or replace function erp.cash_correction(p_session uuid, p_amount numeric, p_label text) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('cash_correct'); v uuid;
begin
  if coalesce(btrim(p_label),'') = '' then raise exception 'Justification obligatoire.'; end if;
  perform 1 from erp.cash_sessions where id = p_session for update;
  insert into erp.cash_moves(session_id, kind, amount, label, staff_id) values (p_session, 'correction', p_amount, 'Correction gérant : ' || p_label, me) returning id into v;
  return v;
end $$;

-- ============================ LIVRAISONS ============================
create or replace function erp.line_remaining(p_line uuid, p_size text) returns int language sql stable as $$
  select coalesce((l.sizes->>p_size)::int, 0) - coalesce((l.delivered->>p_size)::int, 0)
    - coalesce((select sum(sl.qty) from erp.shipment_lines sl join erp.shipments s on s.id = sl.shipment_id
                where sl.line_id = l.id and sl.size = p_size and s.status in ('preparation','expedie','en_transit','echec')), 0)
  from erp.lines l where l.id = p_line
$$;

create or replace function erp.create_shipment(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('shipping'); o record; v uuid; it jsonb; ln record; items jsonb := p->'items'; rem int; q int; n int; mode text := coalesce(p->>'mode','retrait');
        cod numeric := coalesce(nullif(p->>'cod_amount','')::numeric, 0); bal numeric; trk text := upper(nullif(btrim(p->>'tracking'),'')); all_done boolean;
begin
  select * into o from erp.orders where id = (p->>'order_id')::uuid for update;
  if o.status not in ('en_production','prete','expediee','a_retirer') then raise exception 'Commande % non prête à remettre (%).', o.ref, o.status; end if;
  if items is null or jsonb_array_length(items) = 0 then
    select jsonb_agg(jsonb_build_object('line_id', l.id, 'size', s.key, 'qty', erp.line_remaining(l.id, s.key)))
      into items from erp.lines l cross join lateral jsonb_each_text(l.sizes) s
      where l.order_id = o.id and l.produced >= erp.line_qty(l.sizes) and erp.line_remaining(l.id, s.key) > 0;
  end if;
  if items is null then raise exception 'Aucune pièce emballée à remettre.'; end if;
  n := coalesce((select max(number) from erp.shipments where order_id = o.id), 0) + 1;
  insert into erp.shipments(order_id, number, mode, tracking, status, cod_amount, fee, created_by)
  values (o.id, n, mode, trk, case when mode = 'yalidine' and trk is not null then 'expedie' else 'preparation' end,
          case when mode = 'yalidine' then cod else 0 end, coalesce(nullif(p->>'fee','')::numeric, 0), me)
  returning id into v;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    if q is null or q <= 0 then continue; end if;
    select * into ln from erp.lines where id = (it->>'line_id')::uuid and order_id = o.id;
    if not found then raise exception 'Ligne invalide.'; end if;
    if ln.produced < erp.line_qty(ln.sizes) then
      raise exception 'Ligne « % » pas encore contrôlée et emballée.', ln.label;
    end if;
    rem := erp.line_remaining(ln.id, upper(it->>'size'));
    if q > rem then raise exception 'Ligne « % » taille % : % à remettre au maximum.', ln.label, it->>'size', rem; end if;
    insert into erp.shipment_lines(shipment_id, line_id, size, qty) values (v, ln.id, upper(it->>'size'), q);
  end loop;
  if not exists (select 1 from erp.shipment_lines where shipment_id = v) then raise exception 'Colis vide.'; end if;
  if mode = 'yalidine' and cod > 0 then
    bal := o.total_ttc - erp.order_paid(o.id) - coalesce((select sum(amount) from erp.payments where order_id = o.id and status = 'attendu'), 0);
    if cod > bal + 0.001 then raise exception 'Contre-remboursement (% DA) supérieur au reste à payer (% DA).', cod, bal; end if;
    insert into erp.payments(order_id, client_id, kind, method, amount, status, shipment_id, note, staff_id)
    values (o.id, o.client_id, 'solde', 'yalidine_cod', cod, 'attendu', v, 'Contre-remboursement colis ' || n, me);
  end if;
  all_done := not exists (select 1 from erp.tasks where order_id = o.id and status not in ('terminee','annulee'));
  if all_done and o.status in ('prete','en_production','a_retirer','expediee') then
    update erp.orders set status = case when mode = 'yalidine' then 'expediee' else 'a_retirer' end, updated_at = now() where id = o.id;
  end if;
  perform erp.log_order(o.id, 'colis', null, jsonb_build_object('colis', n, 'mode', mode, 'tracking', trk), null);
  perform erp.issue_document('bon_livraison', null, null, v, null, null);
  return v;
end $$;

create or replace function erp.set_tracking(p_shipment uuid, p_tracking text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('shipping'); s record;
begin
  if coalesce(btrim(p_tracking),'') = '' then raise exception 'Tracking vide.'; end if;
  select * into s from erp.shipments where id = p_shipment for update;
  update erp.shipments set tracking = upper(btrim(p_tracking)), status = case when status = 'preparation' then 'expedie' else status end where id = p_shipment;
  perform erp.log_order(s.order_id, 'tracking', jsonb_build_object('tracking', s.tracking), jsonb_build_object('tracking', upper(btrim(p_tracking))), null);
end $$;

create or replace function erp.status_rank(s text) returns int language sql immutable as $$
  select case s when 'preparation' then 0 when 'expedie' then 1 when 'en_transit' then 2 when 'echec' then 3 when 'livre' then 5 when 'retire' then 5 when 'retour' then 6 when 'annule' then 6 else 0 end
$$;

create or replace function erp.on_order_delivered(p_order uuid) returns void language plpgsql as $$
declare o record; card record; b uuid;
begin
  select * into o from erp.orders where id = p_order;
  if o.client_id is null then return; end if;
  if o.kind = 'comptoir' and erp.setting_text('loyalty_on_counter','false') <> 'true' then return; end if;
  if o.total_ttc < erp.setting_num('loyalty_min_order', 0) then return; end if;
  select * into card from erp.loyalty_cards where client_id = o.client_id for update;
  if not found then
    insert into erp.loyalty_cards(client_id, number, first_order_id)
    values (o.client_id, 'CP-' || lpad(erp.next_counter('card')::text, 5, '0'), p_order)
    on conflict (client_id) do nothing;
    select * into card from erp.loyalty_cards where client_id = o.client_id for update;
  end if;
  insert into erp.loyalty_benefits(card_id, source_order_id) values (card.id, p_order) on conflict (source_order_id) do nothing returning id into b;
  if b is not null then
    insert into erp.interactions(client_id, staff_id, kind, summary, order_id)
    values (o.client_id, erp.me(), 'fidelite', 'Carte Privilège ' || card.number || ' : T-shirt caractérisé offert au prochain achat', p_order);
  end if;
end $$;

create or replace function erp.apply_shipment_status(p_shipment uuid, p_status text, p_label text, p_at timestamptz) returns text language plpgsql as $$
declare s record; o record; sl record; full_ boolean; any_delivered boolean;
begin
  select * into s from erp.shipments where id = p_shipment for update;
  if s.status = p_status and p_status <> 'echec' then return 'deja_applique'; end if;
  if s.status in ('livre','retire') and p_status <> 'retour' then return 'ignore_terminal'; end if;
  if s.status in ('retour','annule') then return 'ignore_terminal'; end if;
  select * into o from erp.orders where id = s.order_id for update;
  update erp.shipments set status = p_status, last_event_at = greatest(coalesce(last_event_at, p_at), p_at), last_event_label = coalesce(p_label, p_status),
    attempts = attempts + case when p_status = 'echec' then 1 else 0 end,
    delivered_at = case when p_status in ('livre','retire') then p_at else delivered_at end
  where id = p_shipment;
  if p_status in ('livre','retire') then
    for sl in select * from erp.shipment_lines where shipment_id = p_shipment loop
      update erp.lines set delivered = delivered || jsonb_build_object(sl.size, coalesce((delivered->>sl.size)::int, 0) + sl.qty) where id = sl.line_id;
    end loop;
    update erp.payments set status = 'encaisse_transporteur' where shipment_id = p_shipment and method = 'yalidine_cod' and status = 'attendu';
    update erp.followups set status = 'fait', result = 'Colis livré', done_at = now() where shipment_id = p_shipment and status = 'a_faire';
    select bool_and(coalesce((l.delivered->>k)::int, 0) >= v::int) into full_
    from erp.lines l, jsonb_each_text(l.sizes) x(k, v) where l.order_id = o.id;
    if full_ and o.status not in ('livree','retiree','annulee') then
      update erp.orders set status = case when s.mode = 'retrait' then 'retiree' else 'livree' end, delivered_at = p_at, updated_at = now() where id = o.id;
      perform erp.log_order(o.id, 'statut', jsonb_build_object('status', o.status), jsonb_build_object('status', case when s.mode = 'retrait' then 'retiree' else 'livree' end), coalesce(p_label, 'Livraison confirmée'));
      perform erp.on_order_delivered(o.id);
    else
      perform erp.log_order(o.id, 'livraison_partielle', null, jsonb_build_object('colis', s.number), coalesce(p_label, 'Colis remis'));
    end if;
  elsif p_status = 'echec' then
    insert into erp.followups(client_id, order_id, shipment_id, owner_id, due_date, reason, note)
    values (o.client_id, o.id, p_shipment, o.owner_id, erp.today(), 'incident_livraison', 'Tentative échouée colis ' || coalesce(s.tracking, s.number::text) || ' : ' || coalesce(p_label, ''))
    on conflict do nothing;
    perform erp.log_order(o.id, 'incident', null, jsonb_build_object('colis', s.number, 'statut', 'echec'), p_label);
  elsif p_status = 'retour' then
    update erp.payments set status = 'annule', note = coalesce(note || ' ; ', '') || 'Colis retourné' where shipment_id = p_shipment and status = 'attendu';
    insert into erp.followups(client_id, order_id, shipment_id, owner_id, due_date, reason, note)
    values (o.client_id, o.id, p_shipment, o.owner_id, erp.today(), 'retour_colis', 'Colis ' || coalesce(s.tracking, s.number::text) || ' retourné : ' || coalesce(p_label, ''))
    on conflict do nothing;
    select exists (select 1 from erp.shipments where order_id = o.id and status in ('livre','retire')) into any_delivered;
    if not any_delivered and not exists (select 1 from erp.shipments where order_id = o.id and status in ('preparation','expedie','en_transit','echec')) then
      update erp.orders set status = 'retournee', return_reason = coalesce(p_label, 'Colis retourné'), updated_at = now() where id = o.id;
    end if;
    perform erp.log_order(o.id, 'retour', null, jsonb_build_object('colis', s.number), p_label);
  end if;
  return 'applique';
end $$;

-- Événement transporteur (webhook, synchro API ou saisie manuelle) : idempotent et tolérant au désordre
create or replace function erp.ingest_carrier_event(p_carrier text, p_external_id text, p_tracking text, p_status text, p_label text, p_at timestamptz, p_raw jsonb)
returns text language plpgsql security definer set search_path = erp, pg_temp as $$
declare ev uuid; s record; v_outcome text;
begin
  if not (erp.is_system() or erp.can('shipping')) then raise exception 'Accès refusé (livraisons).'; end if;
  if p_status not in ('expedie','en_transit','livre','echec','retour','annule','retire') then raise exception 'Statut transporteur inconnu : %', p_status; end if;
  insert into erp.carrier_events(carrier, external_id, tracking, status, label, occurred_at, raw)
  values (coalesce(p_carrier,'yalidine'), p_external_id, upper(btrim(p_tracking)), p_status, p_label, coalesce(p_at, now()), p_raw)
  on conflict (carrier, external_id) do nothing returning id into ev;
  if ev is null then return 'doublon'; end if;
  select * into s from erp.shipments where tracking = upper(btrim(p_tracking)) for update;
  if not found then update erp.carrier_events set outcome = 'inconnu' where id = ev; return 'inconnu'; end if;
  if s.last_event_at is not null and coalesce(p_at, now()) < s.last_event_at and erp.status_rank(p_status) <= erp.status_rank(s.status) then
    v_outcome := 'ignore_ancien';
  else
    v_outcome := erp.apply_shipment_status(s.id, p_status, p_label, coalesce(p_at, now()));
  end if;
  update erp.carrier_events set shipment_id = s.id, outcome = v_outcome where id = ev;
  return v_outcome;
end $$;

create or replace function erp.set_shipment_status(p_shipment uuid, p_status text, p_label text) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('shipping'); s record;
begin
  select * into s from erp.shipments where id = p_shipment;
  if s.mode = 'retrait' then
    if p_status <> 'retire' then raise exception 'Un retrait atelier passe uniquement à « retiré ».'; end if;
    return erp.apply_shipment_status(p_shipment, 'retire', coalesce(p_label, 'Retiré à l''atelier'), now());
  end if;
  if s.tracking is null then raise exception 'Saisissez d''abord le tracking.'; end if;
  return erp.ingest_carrier_event('yalidine', 'manuel-' || gen_random_uuid(), s.tracking, p_status, coalesce(p_label, 'Saisie manuelle'), now(), jsonb_build_object('manuel', true, 'par', me));
end $$;

create or replace function erp.restock_return(p_shipment uuid, p_note text) returns int
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('stock_edit'); s record; sl record; it record; n int := 0;
begin
  select * into s from erp.shipments where id = p_shipment for update;
  if s.status <> 'retour' then raise exception 'Seul un colis retourné peut être réintégré.'; end if;
  if s.return_restocked then return 0; end if;
  for sl in select sl.*, l.product_id, l.color, l.services from erp.shipment_lines sl join erp.lines l on l.id = sl.line_id where sl.shipment_id = p_shipment loop
    if sl.product_id is null or cardinality(sl.services) > 0 then continue; end if;  -- pièces personnalisées : non réintégrées en vierge
    select * into it from erp.stock_items where product_id = sl.product_id and color = sl.color and size = sl.size for update;
    if not found then continue; end if;
    update erp.stock_items set physical = physical + sl.qty where id = it.id;
    insert into erp.stock_moves(item_id, qty, kind, order_id, reason, staff_id) values (it.id, sl.qty, 'retour', s.order_id, 'Retour contrôlé : ' || coalesce(p_note, ''), me);
    n := n + sl.qty;
  end loop;
  update erp.shipments set return_restocked = true where id = p_shipment;
  return n;
end $$;

-- ============================ REVERSEMENTS YALIDINE ============================
create or replace function erp.record_remittance(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('remittance'); v uuid; it jsonb; s record; pay record; cod numeric := 0; fees numeric := 0; amt numeric := (p->>'amount_received')::numeric;
begin
  select id into v from erp.remittances where reference = btrim(p->>'reference');
  if found then return v; end if;
  if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then raise exception 'Sélectionnez les colis concernés.'; end if;
  insert into erp.remittances(reference, received_on, amount_received, note, staff_id)
  values (btrim(p->>'reference'), coalesce(nullif(p->>'received_on','')::date, erp.today()), amt, nullif(p->>'note',''), me) returning id into v;
  for it in select * from jsonb_array_elements(p->'items') loop
    select * into s from erp.shipments where id = (it->>'shipment_id')::uuid for update;
    select * into pay from erp.payments where shipment_id = s.id and method = 'yalidine_cod' and status <> 'annule' for update;
    if pay.id is null then raise exception 'Colis % sans contre-remboursement.', coalesce(s.tracking, s.id::text); end if;
    if pay.status <> 'encaisse_transporteur' then raise exception 'Colis % : statut % (attendu : encaissé par le transporteur).', coalesce(s.tracking, s.id::text), pay.status; end if;
    insert into erp.remittance_items(remittance_id, shipment_id, cod_amount, fee) values (v, s.id, pay.amount, coalesce(nullif(it->>'fee','')::numeric, s.fee));
    update erp.shipments set fee = coalesce(nullif(it->>'fee','')::numeric, s.fee) where id = s.id;
    update erp.payments set status = 'rapproche', remittance_id = v where id = pay.id;
    cod := cod + pay.amount; fees := fees + coalesce(nullif(it->>'fee','')::numeric, s.fee);
  end loop;
  update erp.remittances set cod_total = cod, fees_total = fees, expected = cod - fees, gap = amt - (cod - fees) where id = v;
  return v;
end $$;

-- ============================ FIDÉLITÉ ============================
create or replace function erp.apply_benefit(p_order uuid, p_benefit uuid, p_size text, p_color text) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); o record; b record; card record; r erp.lines;
begin
  select * into o from erp.orders where id = p_order for update;
  if o.status <> 'brouillon' then raise exception 'Le cadeau s''ajoute avant la confirmation de la commande.'; end if;
  select * into b from erp.loyalty_benefits where id = p_benefit for update;
  if not found or b.status <> 'disponible' then raise exception 'Cadeau déjà utilisé ou indisponible.'; end if;
  select * into card from erp.loyalty_cards where id = b.card_id;
  if card.client_id <> o.client_id then raise exception 'Ce cadeau appartient à un autre client.'; end if;
  if b.source_order_id = p_order then raise exception 'Le cadeau s''applique à la commande suivante.'; end if;
  insert into erp.lines(order_id, position, product_id, label, color, sizes, unit_price, services, placement, print_width_cm, is_characterized, is_gift)
  values (p_order, coalesce((select max(position) from erp.lines where order_id = p_order), 0) + 1,
          nullif(erp.setting_text('gift_product_id', ''), '')::uuid, 'T-shirt caractérisé offert (Carte Privilège ' || card.number || ')',
          coalesce(nullif(p_color,''), 'Blanc'), jsonb_build_object(upper(coalesce(nullif(p_size,''), 'M')), 1), 0, array['dtf'], 'coeur',
          least(erp.setting_num('characterized_max_width_cm', 30), 28), true, true)
  returning * into r;
  perform erp.check_line(r);
  update erp.loyalty_benefits set status = 'utilise', used_order_id = p_order, used_by = me, used_at = now() where id = p_benefit;
  if o.bat_status = 'sans_objet' then update erp.orders set bat_status = 'a_faire', kind = 'personnalise' where id = p_order; end if;
  perform erp.recalc_order(p_order);
  perform erp.log_order(p_order, 'fidelite', null, jsonb_build_object('benefit', p_benefit), 'Cadeau Carte Privilège appliqué');
end $$;

create or replace function erp.public_card(p_token text) returns jsonb
language sql stable security definer set search_path = erp, pg_temp as $$
  select jsonb_build_object('number', c.number, 'first_name', split_part(cl.name, ' ', 1), 'issued_at', c.issued_at,
    'gift_available', exists (select 1 from erp.loyalty_benefits b where b.card_id = c.id and b.status = 'disponible'),
    'offer', erp.setting_text('loyalty_offer_text', 'Au prochain achat, vous aurez un T-shirt caractérisé gratuit.'),
    'photo_url', erp.setting_text('loyalty_photo_url', '/tshirt-caracterise.svg'))
  from erp.loyalty_cards c join erp.clients cl on cl.id = c.client_id
  where c.token = p_token and length(p_token) >= 32
$$;

-- ============================ VENTE COMPTOIR IMMÉDIATE ============================
create or replace function erp.counter_sale(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('payment_record'); key text := nullif(p->>'idempotency_key',''); v uuid; cid uuid := nullif(p->>'client_id','')::uuid;
        it jsonb; si record; pr record; sh uuid; ln uuid; ph text;
begin
  if key is not null then select id into v from erp.orders where idempotency_key = key; if found then return v; end if; end if;
  if cid is null then
    ph := erp.normalize_phone(p->>'client_phone');
    if ph is not null then select id into cid from erp.clients where phone = ph; end if;
    if cid is null then
      insert into erp.clients(kind, name, phone, phone_raw, source, owner_id, created_by)
      values ('client', coalesce(nullif(btrim(p->>'client_name'),''), 'Client comptoir'), ph, nullif(p->>'client_phone',''), 'comptoir', me, me)
      returning id into cid;
    end if;
  end if;
  insert into erp.orders(ref, client_id, kind, status, owner_id, promised_date, deposit_pct, bat_status, idempotency_key, created_by, confirmed_at, confirmed_by)
  values (erp.new_ref(), cid, 'comptoir', 'confirmee', me, erp.today(), 100, 'sans_objet', key, me, now(), me) returning id into v;
  for it in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    select * into si from erp.stock_items where id = (it->>'item_id')::uuid for update;
    select * into pr from erp.products where id = si.product_id;
    if si.physical - si.reserved < (it->>'qty')::int then
      raise exception 'Stock insuffisant : % % % (disponible %).', pr.name, si.color, si.size, si.physical - si.reserved;
    end if;
    insert into erp.lines(order_id, position, product_id, label, color, sizes, unit_price, produced)
    values (v, coalesce((select max(position) from erp.lines where order_id = v), 0) + 1, pr.id, pr.name, si.color,
            jsonb_build_object(si.size, (it->>'qty')::int), coalesce(nullif(it->>'unit_price','')::numeric, pr.sale_price), (it->>'qty')::int)
    returning id into ln;
    insert into erp.reservations(order_id, line_id, item_id, size, qty) values (v, ln, si.id, si.size, (it->>'qty')::int);
    update erp.stock_items set reserved = reserved + (it->>'qty')::int where id = si.id;
    perform erp.consume_line_stock(ln, 'sortie_client');
  end loop;
  if not exists (select 1 from erp.lines where order_id = v) then raise exception 'Panier vide.'; end if;
  perform erp.recalc_order(v);
  perform erp.log_order(v, 'creation', null, jsonb_build_object('status','retiree'), 'Vente comptoir immédiate');
  perform erp.record_payment(jsonb_build_object('order_id', v, 'amount', (select total_ttc from erp.orders where id = v), 'method', coalesce(p->>'method','especes'),
                                                'idempotency_key', case when key is not null then key || '-pay' end));
  insert into erp.shipments(order_id, number, mode, status, created_by) values (v, 1, 'retrait', 'preparation', me) returning id into sh;
  insert into erp.shipment_lines(shipment_id, line_id, size, qty) select sh, l.id, s.key, s.value::int from erp.lines l, jsonb_each_text(l.sizes) s where l.order_id = v;
  update erp.orders set status = 'prete' where id = v;
  perform erp.apply_shipment_status(sh, 'retire', 'Vente comptoir', now());
  return v;
end $$;

-- ============================ IMPORTS CSV ============================
create or replace function erp.preview_client_import(p_rows jsonb) returns jsonb
language plpgsql stable security definer set search_path = erp, pg_temp as $$
declare r jsonb; i int := 0; out jsonb := '[]'::jsonb; ph text; st text; seen text[] := '{}'; ex_id uuid; ex_name text;
begin
  perform erp.need('clients_edit');
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; ex_id := null; ex_name := null;
    ph := erp.normalize_phone(r->>'phone');
    if coalesce(btrim(r->>'name'),'') = '' then st := 'invalide: nom manquant';
    elsif coalesce(btrim(r->>'phone'),'') <> '' and ph is null then st := 'invalide: téléphone';
    elsif ph is not null and ph = any(seen) then st := 'doublon_fichier';
    else
      select id, name into ex_id, ex_name from erp.clients where phone = ph;
      st := case when ex_id is not null then 'doublon_base' else 'nouveau' end;
    end if;
    if ph is not null then seen := seen || ph; end if;
    out := out || jsonb_build_array(r || jsonb_build_object('row', i, 'phone_normalized', ph, 'status', st, 'existing_name', ex_name));
  end loop;
  return out;
end $$;

create or replace function erp.import_clients(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('clients_edit'); r jsonb; created int := 0; skipped int := 0;
begin
  for r in select * from jsonb_array_elements(erp.preview_client_import(p_rows)) loop
    if r->>'status' <> 'nouveau' then skipped := skipped + 1; continue; end if;
    insert into erp.clients(kind, name, company, phone, phone_raw, email, wilaya, commune, address, source, owner_id, notes, created_by, marketing_opt_out)
    values (case when r->>'kind' = 'client' then 'client' else 'prospect' end, btrim(r->>'name'), nullif(r->>'company',''), r->>'phone_normalized', nullif(r->>'phone',''),
            nullif(r->>'email',''), nullif(r->>'wilaya',''), nullif(r->>'commune',''), nullif(r->>'address',''), coalesce(nullif(r->>'source',''), 'import'), me,
            nullif(r->>'notes',''), me, coalesce(lower(r->>'marketing_opt_out') in ('1','oui','true','yes'), false));
    created := created + 1;
  end loop;
  return jsonb_build_object('created', created, 'skipped', skipped);
end $$;

create or replace function erp.preview_stock_import(p_rows jsonb) returns jsonb
language plpgsql stable security definer set search_path = erp, pg_temp as $$
declare r jsonb; i int := 0; out jsonb := '[]'::jsonb; st text; k text; seen text[] := '{}'; ex_id uuid; ex_phys int;
begin
  perform erp.need('stock_edit');
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; ex_id := null; ex_phys := null;
    k := upper(btrim(coalesce(r->>'ref',''))) || '|' || btrim(coalesce(r->>'color','')) || '|' || upper(btrim(coalesce(r->>'size','')));
    if coalesce(btrim(r->>'ref'),'') = '' then st := 'invalide: référence manquante';
    elsif coalesce(r->>'qty','0') !~ '^\d+$' then st := 'invalide: quantité';
    elsif k = any(seen) then st := 'doublon_fichier';
    else
      select si.id, si.physical into ex_id, ex_phys from erp.stock_items si join erp.products p on p.id = si.product_id
      where p.ref = upper(btrim(r->>'ref')) and si.color = btrim(coalesce(r->>'color','')) and si.size = upper(btrim(coalesce(r->>'size','')));
      st := case when ex_id is not null then 'existant' else 'nouveau' end;
    end if;
    seen := seen || k;
    out := out || jsonb_build_array(r || jsonb_build_object('row', i, 'status', st, 'current_physical', ex_phys));
  end loop;
  return out;
end $$;

-- Import stock : crée produits et articles ; la quantité est ajoutée en réception (articles nouveaux)
-- ou appliquée en inventaire (articles existants, si mode = 'inventaire')
create or replace function erp.import_stock(p_rows jsonb, p_mode text default 'ignorer') returns jsonb
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('stock_edit'); r jsonb; pid uuid; iid uuid; created int := 0; updated int := 0; skipped int := 0;
begin
  for r in select * from jsonb_array_elements(erp.preview_stock_import(p_rows)) loop
    if r->>'status' not in ('nouveau','existant') or (r->>'status' = 'existant' and p_mode <> 'inventaire') then skipped := skipped + 1; continue; end if;
    pid := erp.upsert_product(jsonb_build_object('ref', r->>'ref', 'name', coalesce(nullif(r->>'name',''), r->>'ref'), 'kind', coalesce(nullif(r->>'kind',''), 'vetement'),
                                                 'sale_price', nullif(r->>'sale_price',''), 'cost', nullif(r->>'cost','')) - case when coalesce(r->>'sale_price','') = '' then 'sale_price' else '' end
                                                 - case when coalesce(r->>'cost','') = '' then 'cost' else '' end);
    iid := erp.upsert_stock_item(pid, r->>'color', r->>'size', nullif(r->>'threshold','')::int);
    if r->>'status' = 'nouveau' then
      if coalesce((r->>'qty')::int, 0) > 0 then perform erp.stock_move(iid, 'reception', (r->>'qty')::int, 'Import initial'); end if;
      created := created + 1;
    else
      perform erp.stock_move(iid, 'inventaire', (r->>'qty')::int, 'Inventaire par import');
      updated := updated + 1;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated, 'skipped', skipped);
end $$;

-- ============================ ADMINISTRATION ============================
create or replace function erp.save_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
begin
  perform erp.need('settings');
  insert into erp.settings(key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function erp.save_staff(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare v uuid := nullif(p->>'id','')::uuid;
begin
  perform erp.need('settings');
  if v is null then
    insert into erp.staff(full_name, email, phone, roles, can_validate_first_piece, auth_user_id)
    values (p->>'full_name', nullif(lower(p->>'email'),''), nullif(p->>'phone',''), array(select jsonb_array_elements_text(p->'roles')),
            coalesce((p->>'can_validate_first_piece')::boolean, false), nullif(p->>'auth_user_id','')::uuid)
    returning id into v;
  else
    update erp.staff set full_name = coalesce(nullif(p->>'full_name',''), full_name), email = nullif(lower(p->>'email'),''), phone = nullif(p->>'phone',''),
      roles = array(select jsonb_array_elements_text(p->'roles')), can_validate_first_piece = coalesce((p->>'can_validate_first_piece')::boolean, false),
      active = coalesce((p->>'active')::boolean, active), auth_user_id = coalesce(nullif(p->>'auth_user_id','')::uuid, auth_user_id)
    where id = v;
  end if;
  return v;
end $$;

create or replace function erp.save_machine(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare v uuid := nullif(p->>'id','')::uuid;
begin
  perform erp.need('settings');
  if v is null then
    insert into erp.machines(name, kind, laize_cm) values (p->>'name', p->>'kind', nullif(p->>'laize_cm','')::numeric) returning id into v;
  else
    update erp.machines set name = p->>'name', kind = p->>'kind', laize_cm = nullif(p->>'laize_cm','')::numeric, active = coalesce((p->>'active')::boolean, active) where id = v;
  end if;
  return v;
end $$;

-- Rattache un compte Supabase Auth à une fiche équipe par e-mail (appelé à la connexion)
create or replace function erp.link_auth_user() returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare v uuid; p_email text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  if p_email is null then return null; end if;
  if erp.uid() is null then return null; end if;
  select id into v from erp.staff where auth_user_id = erp.uid();
  if found then return v; end if;
  update erp.staff set auth_user_id = erp.uid() where lower(email) = lower(p_email) and auth_user_id is null and active returning id into v;
  return v;
end $$;
