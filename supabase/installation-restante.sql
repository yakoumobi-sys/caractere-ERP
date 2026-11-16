-- Caractère ERP — installation restante (à exécuter une fois dans Supabase → SQL Editor → Run).
-- Les blocs 0001, 0002 et le début de 0003 sont déjà appliqués. Ce script ne supprime aucune donnée :
-- il crée ou remplace uniquement des fonctions, des vues et des réglages du schéma erp.

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
create or replace function erp.line_remaining(p_line uuid, p_size text) returns int language sql stable security definer set search_path = erp, pg_temp as $$
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


-- Caractère ERP v2 — vues de lecture (filtrage des lignes ET masquage des colonnes selon le rôle) et droits
-- Les tables ne sont jamais lisibles directement par les rôles anon/authenticated : seules ces vues le sont.

create or replace function erp.task_label(step text) returns text language sql immutable as $$
  select case step when 'preparation_fichier' then 'Préparer le fichier' when 'impression_dtf' then 'Imprimer le DTF'
    when 'flocage' then 'Presser (flocage)' when 'broderie' then 'Broder' when 'preparation' then 'Préparer les articles'
    when 'controle' then 'Contrôler les pièces' when 'emballage' then 'Emballer' else step end
$$;

create or replace function erp.task_next_action(t erp.tasks) returns text language sql stable as $$
  select case
    when t.status = 'bloquee' then 'Bloquée : ' || coalesce(t.blocked_reason, '')
    when t.status = 'terminee' then 'Terminé'
    when t.status = 'annulee' then 'Annulée'
    when t.status = 'en_cours' and t.needs_first_piece and t.first_piece_status = 'a_valider' then 'Contrôler la première pièce'
    when t.status = 'en_cours' and t.needs_first_piece and t.first_piece_status = 'refusee' then 'Refaire la première pièce'
    when t.status = 'en_cours' and t.needs_first_piece and t.first_piece_status = 'validee' then 'Produire la série'
    when t.status = 'en_cours' then 'Terminer : ' || lower(erp.task_label(t.step))
    when t.needs_first_piece then 'Démarrer et présenter la première pièce'
    else erp.task_label(t.step) end
$$;

create or replace function erp.order_next_action(o erp.orders) returns text language plpgsql stable security definer set search_path = erp, pg_temp as $$
declare paid numeric; miss int; t erp.tasks; money boolean := erp.can('money_view'); fails int; rem int; bal numeric;
begin
  paid := erp.order_paid(o.id); bal := o.total_ttc - paid;
  if o.status = 'brouillon' then
    if exists (select 1 from erp.lines where order_id = o.id and cardinality(services) > 0) then
      if o.bat_status = 'a_faire' then return 'Envoyer le BAT au client'; end if;
      if o.bat_status in ('envoye','refuse') then return 'Faire valider le BAT'; end if;
      if o.agreement_file_id is null and coalesce(o.agreement_note,'') = '' then return 'Enregistrer la preuve d''accord'; end if;
    end if;
    if paid < o.deposit_required then return case when money then 'Encaisser l''acompte (' || (o.deposit_required - paid)::bigint || ' DA)' else 'En attente d''acompte' end; end if;
    return 'Confirmer la commande';
  elsif o.status in ('confirmee','en_production') then
    if o.blocked_reason is not null then return 'Débloquer : ' || o.blocked_reason; end if;
    miss := erp.order_shortage(o.id);
    if miss > 0 then return 'Réapprovisionner : ' || miss || ' pièce(s) manquante(s)'; end if;
    select * into t from erp.tasks where order_id = o.id and status = 'bloquee' order by seq limit 1;
    if found then return 'Débloquer : ' || t.blocked_reason; end if;
    select tk.* into t from erp.tasks tk where tk.order_id = o.id and tk.status in ('a_faire','en_cours')
      and not exists (select 1 from erp.tasks p where p.line_id = tk.line_id and p.seq < tk.seq and p.status not in ('terminee','annulee'))
    order by (tk.status = 'en_cours') desc, tk.seq limit 1;
    if found then return erp.task_next_action(t); end if;
    return 'Vérifier les tâches atelier';
  elsif o.status = 'prete' then
    return case when o.delivery_mode = 'yalidine' then 'Créer le colis Yalidine' else 'Prévenir le client : commande prête au retrait' end;
  elsif o.status in ('expediee','a_retirer') then
    select count(*) into fails from erp.shipments where order_id = o.id and status = 'echec';
    if fails > 0 then return 'Rappeler le client : tentative de livraison échouée'; end if;
    select coalesce(sum(erp.line_remaining(l.id, s.key)), 0) into rem from erp.lines l, jsonb_each_text(l.sizes) s where l.order_id = o.id;
    if o.status = 'a_retirer' then
      return 'Remettre au client' || case when money and bal > 0 then ' et encaisser ' || bal::bigint || ' DA' else '' end;
    end if;
    if rem > 0 then return 'Expédier le reste (' || rem || ' pièce(s))'; end if;
    return 'Suivre la livraison';
  elsif o.status in ('livree','retiree') then
    if money and bal > 0 and not exists (select 1 from erp.payments where order_id = o.id and status = 'attendu') then return 'Encaisser le solde (' || bal::bigint || ' DA)'; end if;
    return 'Terminée';
  elsif o.status = 'annulee' then
    if o.refund_due > 0 then return case when money then 'Rembourser ' || o.refund_due::bigint || ' DA' else 'Remboursement à traiter' end; end if;
    if o.rework_note is not null then return 'À traiter : ' || o.rework_note; end if;
    return 'Annulée';
  elsif o.status = 'retournee' then
    return 'Traiter le retour : ' || coalesce(o.return_reason, '');
  end if;
  return '';
end $$;

create or replace function erp.order_progress(o erp.orders) returns jsonb language sql stable security definer set search_path = erp, pg_temp as $$
  with q as (select coalesce(sum(erp.line_qty(sizes)), 0) total,
                    coalesce(sum((select coalesce(sum(value::int), 0) from jsonb_each_text(delivered))), 0) delivered
             from erp.lines where order_id = o.id),
       t as (select count(*) filter (where status <> 'annulee') n, count(*) filter (where status = 'terminee') done from erp.tasks where order_id = o.id)
  select jsonb_build_object(
    'commercial', case when o.status <> 'brouillon' then 100
                       else (case when o.bat_status in ('valide','sans_objet') then 40 else 0 end)
                          + (case when o.agreement_file_id is not null or coalesce(o.agreement_note,'') <> '' or o.bat_status = 'sans_objet' then 20 else 0 end)
                          + (case when erp.order_paid(o.id) >= o.deposit_required then 40 else 0 end) end,
    'fabrication', case when o.status in ('prete','expediee','a_retirer','livree','retiree') then 100 when t.n = 0 then 0 else round(100.0 * t.done / t.n) end,
    'livraison', case when q.total = 0 then 0 else round(100.0 * q.delivered / q.total) end,
    'reglement', case when o.total_ttc = 0 then 100 else least(100, round(100 * erp.order_paid(o.id) / o.total_ttc)) end)
  from q, t
$$;

create or replace view erp.v_me as
  select s.id, s.full_name, s.email, s.roles, s.can_validate_first_piece from erp.staff s where s.auth_user_id = erp.uid() and s.active;

create or replace view erp.v_staff as
  select id, full_name, roles, active, can_validate_first_piece, case when erp.can('settings') then email end email, case when erp.can('settings') then auth_user_id end auth_user_id
  from erp.staff where erp.me() is not null;

create or replace view erp.v_machines as select * from erp.machines where erp.me() is not null;

create or replace view erp.v_settings as
  select key, value from erp.settings where erp.me() is not null and (key not like 'secret%');

create or replace view erp.v_clients as
  select c.*, s.full_name owner_name,
    (select count(*) from erp.orders o where o.client_id = c.id and o.status not in ('brouillon','annulee')) orders_count,
    (select max(o.delivered_at) from erp.orders o where o.client_id = c.id) last_delivery_at,
    lc.number card_number, lc.token card_token,
    (select count(*) from erp.loyalty_benefits b where b.card_id = lc.id and b.status = 'disponible') gifts_available
  from erp.clients c left join erp.staff s on s.id = c.owner_id left join erp.loyalty_cards lc on lc.client_id = c.id
  where erp.can('clients_view');

create or replace view erp.v_interactions as
  select i.*, s.full_name staff_name from erp.interactions i left join erp.staff s on s.id = i.staff_id where erp.can('clients_view');

create or replace view erp.v_followups as
  select f.*, c.name client_name, c.phone client_phone, c.contact_pref, c.marketing_opt_out, s.full_name owner_name, d.full_name done_by_name,
         o.ref order_ref, q.ref quote_ref
  from erp.followups f join erp.clients c on c.id = f.client_id left join erp.staff s on s.id = f.owner_id left join erp.staff d on d.id = f.done_by
  left join erp.orders o on o.id = f.order_id left join erp.quotes q on q.id = f.quote_id
  where erp.can('clients_view') and not (f.is_marketing and c.marketing_opt_out and f.status = 'a_faire');

create or replace view erp.v_deals as
  select d.*, c.name client_name, c.phone client_phone, s.full_name owner_name,
    (select q.id from erp.quotes q where q.deal_id = d.id order by q.created_at desc limit 1) last_quote_id,
    (select q.ref from erp.quotes q where q.deal_id = d.id order by q.created_at desc limit 1) last_quote_ref
  from erp.deals d join erp.clients c on c.id = d.client_id left join erp.staff s on s.id = d.owner_id
  where erp.can('sales');

create or replace view erp.v_quotes as
  select q.*, c.name client_name, c.phone client_phone, s.full_name owner_name, erp.quote_totals(q.id) totals,
    (select o.id from erp.orders o where o.quote_id = q.id) order_id
  from erp.quotes q join erp.clients c on c.id = q.client_id left join erp.staff s on s.id = q.owner_id
  where erp.can('sales');

create or replace view erp.v_simulations as
  select * from erp.simulations where erp.can('sales');

create or replace view erp.v_orders as
  select o.id, o.ref, o.client_id, o.quote_id, o.kind, o.status, o.blocked_reason, o.cancel_reason, o.return_reason, o.owner_id, o.promised_date,
    o.delivery_mode, o.ship_wilaya, o.ship_commune, o.ship_stopdesk, o.bat_status, o.bat_validated_at, o.logo_file_id, o.bat_file_id, o.agreement_file_id,
    o.agreement_note, o.notes, o.rework_note, o.confirmed_at, o.ready_at, o.delivered_at, o.created_at, o.updated_at,
    c.name client_name,
    case when erp.can('clients_view') then c.phone end client_phone,
    case when erp.can('clients_view') then o.ship_name end ship_name,
    case when erp.can('clients_view') then o.ship_phone end ship_phone,
    case when erp.can('clients_view') then o.ship_address end ship_address,
    s.full_name owner_name,
    case when erp.can('money_view') then o.total_ht end total_ht,
    case when erp.can('money_view') then o.total_tva end total_tva,
    case when erp.can('money_view') then o.total_ttc end total_ttc,
    case when erp.can('money_view') then o.deposit_pct end deposit_pct,
    case when erp.can('money_view') then o.deposit_required end deposit_required,
    case when erp.can('money_view') then o.deposit_waived_reason end deposit_waived_reason,
    case when erp.can('money_view') then erp.order_paid(o.id) end paid,
    case when erp.can('money_view') then o.total_ttc - erp.order_paid(o.id) end balance,
    case when erp.can('money_view') then (select coalesce(sum(amount), 0) from erp.payments p where p.order_id = o.id and p.status = 'attendu') end cod_pending,
    case when erp.can('money_view') then o.refund_due end refund_due,
    (select coalesce(sum(erp.line_qty(sizes)), 0) from erp.lines l where l.order_id = o.id)::int qty_total,
    erp.order_shortage(o.id) shortage,
    (o.promised_date < erp.today() and o.status not in ('livree','retiree','annulee','retournee')) is_late,
    (o.blocked_reason is not null or exists (select 1 from erp.tasks t where t.order_id = o.id and t.status = 'bloquee')
       or (o.status in ('confirmee','en_production') and erp.order_shortage(o.id) > 0)) is_blocked,
    (select string_agg(distinct t.blocked_reason, ' ; ') from erp.tasks t where t.order_id = o.id and t.status = 'bloquee') task_block_reasons,
    erp.order_next_action(o) next_action,
    case when erp.can('money_view') then erp.order_progress(o) else erp.order_progress(o) - 'reglement' end progress,
    (select string_agg(sh.tracking, ' ') from erp.shipments sh where sh.order_id = o.id and sh.tracking is not null) trackings,
    (select array_agg(distinct x) from erp.lines l, unnest(l.services) x where l.order_id = o.id) services
  from erp.orders o left join erp.clients c on c.id = o.client_id left join erp.staff s on s.id = o.owner_id
  where erp.can('orders_view') and (o.status <> 'brouillon' or erp.can('orders_edit') or erp.can('money_view'));

create or replace view erp.v_lines as
  select l.id, l.quote_id, l.order_id, l.position, l.product_id, l.label, l.color, l.sizes, l.services, l.placement, l.print_width_cm,
    l.is_characterized, l.is_gift, l.produced, l.delivered, erp.line_qty(l.sizes) qty, p.ref product_ref,
    case when erp.can('money_view') then l.unit_price end unit_price,
    case when erp.can('money_view') then l.service_price end service_price,
    case when erp.can('money_view') then l.discount_pct end discount_pct,
    case when erp.can('money_view') then erp.line_amount(l) end amount,
    case when l.order_id is not null then erp.line_missing(l.id) end missing,
    (select coalesce(jsonb_object_agg(size, q), '{}'::jsonb) from (select size, sum(qty) q from erp.reservations r where r.line_id = l.id and r.status = 'active' group by size) x) reserved,
    (select coalesce(jsonb_object_agg(size, q), '{}'::jsonb) from (select size, sum(qty) q from erp.reservations r where r.line_id = l.id and r.status = 'consommee' group by size) x) issued
  from erp.lines l left join erp.products p on p.id = l.product_id
  where (l.order_id is not null and erp.can('orders_view')) or (l.quote_id is not null and erp.can('sales'));

create or replace view erp.v_tasks as
  select t.*, o.ref order_ref, o.status order_status, o.promised_date, o.bat_status, o.bat_file_id, o.logo_file_id, o.created_at order_created_at,
    c.name client_name, l.label line_label, l.color, l.sizes, l.placement, l.print_width_cm, l.is_characterized, l.services,
    a.full_name assignee_name, m.name machine_name, m.laize_cm, n.full_name notify_name, fp.full_name first_piece_by_name,
    sb.full_name started_by_name, fb.full_name finished_by_name,
    erp.task_next_action(t) next_action, erp.line_missing(t.line_id) missing,
    (o.promised_date < erp.today()) is_late,
    not exists (select 1 from erp.tasks p where p.line_id = t.line_id and p.seq < t.seq and p.status not in ('terminee','annulee')) is_ready
  from erp.tasks t join erp.orders o on o.id = t.order_id left join erp.clients c on c.id = o.client_id join erp.lines l on l.id = t.line_id
  left join erp.staff a on a.id = t.assignee_id left join erp.machines m on m.id = t.machine_id left join erp.staff n on n.id = t.notify_staff_id
  left join erp.staff fp on fp.id = t.first_piece_by left join erp.staff sb on sb.id = t.started_by left join erp.staff fb on fb.id = t.finished_by
  where erp.can('workshop_view') or erp.can('orders_edit');

create or replace view erp.v_task_log as
  select g.*, s.full_name staff_name from erp.task_log g left join erp.staff s on s.id = g.staff_id where erp.can('workshop_view') or erp.can('orders_edit');

create or replace view erp.v_defects as
  select d.*, s.full_name staff_name, o.ref order_ref, l.label line_label from erp.defects d left join erp.staff s on s.id = d.staff_id
  join erp.orders o on o.id = d.order_id join erp.lines l on l.id = d.line_id
  where erp.can('workshop_view') or erp.can('orders_edit');

create or replace view erp.v_products as
  select id, ref, name, kind, unit, active, case when erp.can('money_view') or erp.can('stock_edit') then sale_price end sale_price,
         case when erp.can('cost_view') then cost end cost
  from erp.products where erp.can('stock_view');

create or replace view erp.v_stock as
  select si.id, si.product_id, p.ref, p.name, p.kind, p.unit, si.color, si.size, si.physical, si.reserved, si.physical - si.reserved available,
    si.alert_threshold, (si.physical - si.reserved) <= si.alert_threshold is_alert,
    case when erp.can('money_view') or erp.can('stock_edit') then p.sale_price end sale_price,
    case when erp.can('cost_view') then p.cost end cost,
    (select coalesce(sum(pr.qty), 0) from erp.purchase_requests pr where pr.item_id = si.id and pr.status in ('a_valider','validee')) on_order
  from erp.stock_items si join erp.products p on p.id = si.product_id where erp.can('stock_view');

create or replace view erp.v_stock_moves as
  select m.*, p.ref, p.name, si.color, si.size, s.full_name staff_name, o.ref order_ref
  from erp.stock_moves m join erp.stock_items si on si.id = m.item_id join erp.products p on p.id = si.product_id
  left join erp.staff s on s.id = m.staff_id left join erp.orders o on o.id = m.order_id where erp.can('stock_view');

create or replace view erp.v_purchase_requests as
  select pr.*, p.ref, p.name, si.color, si.size, si.physical, si.reserved, r.full_name requested_by_name, d.full_name decided_by_name, o.ref order_ref
  from erp.purchase_requests pr join erp.stock_items si on si.id = pr.item_id join erp.products p on p.id = si.product_id
  left join erp.staff r on r.id = pr.requested_by left join erp.staff d on d.id = pr.decided_by left join erp.orders o on o.id = pr.order_id
  where erp.can('stock_view');

create or replace view erp.v_order_events as
  select e.id, e.order_id, e.kind, e.before, e.after, e.note, e.at, s.full_name staff_name
  from erp.order_events e left join erp.staff s on s.id = e.staff_id
  where erp.can('orders_view') and (erp.can('money_view') or e.kind not in ('paiement','remboursement'));

create or replace view erp.v_shipments as
  select sh.id, sh.order_id, sh.number, sh.mode, sh.tracking, sh.status, sh.attempts, sh.last_event_at, sh.last_event_label, sh.return_restocked,
    sh.created_at, sh.delivered_at, o.ref order_ref, c.name client_name, o.ship_wilaya, o.owner_id,
    case when erp.can('money_view') then sh.cod_amount end cod_amount,
    case when erp.can('money_view') then sh.fee end fee,
    case when erp.can('money_view') then (select p.status from erp.payments p where p.shipment_id = sh.id and p.method = 'yalidine_cod' and p.status <> 'annule' limit 1) end cod_status,
    (select jsonb_agg(jsonb_build_object('line_id', sl.line_id, 'label', l.label, 'color', l.color, 'size', sl.size, 'qty', sl.qty)) from erp.shipment_lines sl join erp.lines l on l.id = sl.line_id where sl.shipment_id = sh.id) items,
    (select sum(qty) from erp.shipment_lines sl where sl.shipment_id = sh.id)::int qty
  from erp.shipments sh join erp.orders o on o.id = sh.order_id left join erp.clients c on c.id = o.client_id
  where erp.can('orders_view');

create or replace view erp.v_carrier_events as
  select * from erp.carrier_events where erp.can('shipping') or erp.can('money_view');

create or replace view erp.v_payments as
  select p.*, o.ref order_ref, c.name client_name, s.full_name staff_name, sh.tracking
  from erp.payments p left join erp.orders o on o.id = p.order_id left join erp.clients c on c.id = p.client_id
  left join erp.staff s on s.id = p.staff_id left join erp.shipments sh on sh.id = p.shipment_id
  where erp.can('money_view');

create or replace view erp.v_cash_sessions as
  select cs.*, ob.full_name opened_by_name, cb.full_name closed_by_name,
    (select coalesce(sum(amount), 0) from erp.cash_moves m where m.session_id = cs.id) current_expected,
    (select coalesce(sum(amount), 0) from erp.cash_moves m where m.session_id = cs.id and m.kind = 'correction') corrections
  from erp.cash_sessions cs left join erp.staff ob on ob.id = cs.opened_by left join erp.staff cb on cb.id = cs.closed_by
  where erp.can('cash');

create or replace view erp.v_cash_moves as
  select m.*, s.full_name staff_name from erp.cash_moves m left join erp.staff s on s.id = m.staff_id where erp.can('cash');

create or replace view erp.v_remittances as
  select r.*, s.full_name staff_name, (select count(*) from erp.remittance_items i where i.remittance_id = r.id) parcels
  from erp.remittances r left join erp.staff s on s.id = r.staff_id where erp.can('remittance') or erp.can('cash');

create or replace view erp.v_documents as
  select d.id, d.kind, d.number, d.version, d.order_id, d.quote_id, d.shipment_id, d.payment_id, d.status, d.replaces_id, d.correction_reason,
    d.issued_at, s.full_name issued_by_name,
    case when erp.can('money_view') then d.total_ttc end total_ttc,
    case when erp.can('money_view') or d.kind = 'bon_livraison' then d.snapshot end snapshot
  from erp.documents d left join erp.staff s on s.id = d.issued_by
  where erp.can('money_view') or (d.kind = 'bon_livraison' and erp.can('shipping'));

create or replace view erp.v_files as
  select f.id, f.kind, f.client_id, f.order_id, f.quote_id, f.deal_id, f.storage, f.path, f.filename, f.mime, f.size_bytes, f.created_at
  from erp.files f
  where (f.order_id is not null and erp.can('orders_view')) or erp.can('clients_view') or erp.can('sales');

create or replace view erp.v_loyalty as
  select c.id card_id, c.client_id, c.number, c.token, c.issued_at, c.first_order_id, b.id benefit_id, b.status benefit_status, b.source_order_id,
    b.used_order_id, b.used_at, b.issued_at benefit_issued_at, so.ref source_ref, uo.ref used_ref
  from erp.loyalty_cards c left join erp.loyalty_benefits b on b.card_id = c.id left join erp.orders so on so.id = b.source_order_id
  left join erp.orders uo on uo.id = b.used_order_id
  where erp.can('clients_view') or erp.can('orders_edit');

-- Recherche globale : téléphone, nom, référence, tracking
create or replace function erp.search(q text) returns table(kind text, id uuid, title text, subtitle text)
language sql stable security definer set search_path = erp, pg_temp as $$
  with t as (select btrim(q) s, erp.normalize_phone(q) ph)
  select 'client', c.id, c.name, coalesce(c.phone, '') || coalesce(' · ' || c.company, '') from erp.clients c, t
    where erp.can('clients_view') and length(t.s) >= 2 and (c.phone = t.ph or c.name ilike '%' || t.s || '%' or c.company ilike '%' || t.s || '%'
      or (length(regexp_replace(t.s, '\D', '', 'g')) >= 6 and c.phone like '%' || regexp_replace(t.s, '\D', '', 'g') || '%'))
  union all
  select 'commande', o.id, o.ref, coalesce(c.name, '') || ' · ' || o.status from erp.orders o left join erp.clients c on c.id = o.client_id, t
    where erp.can('orders_view') and length(t.s) >= 2 and (o.status <> 'brouillon' or erp.can('orders_edit'))
      and (o.ref ilike '%' || t.s || '%' or (erp.can('clients_view') and (c.phone = t.ph or c.name ilike '%' || t.s || '%'))
           or exists (select 1 from erp.shipments sh where sh.order_id = o.id and sh.tracking ilike '%' || t.s || '%'))
  union all
  select 'devis', qu.id, qu.ref, c.name || ' · ' || qu.status from erp.quotes qu join erp.clients c on c.id = qu.client_id, t
    where erp.can('sales') and length(t.s) >= 2 and qu.ref ilike '%' || t.s || '%' and not exists (select 1 from erp.orders o where o.quote_id = qu.id)
  limit 30
$$;

-- ============================ DROITS ============================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;

alter table erp.settings enable row level security;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'erp' loop
    execute format('alter table erp.%I enable row level security', t);
    execute format('revoke all on erp.%I from public, anon, authenticated', t);
  end loop;
end $$;

grant usage on schema erp to authenticated, anon;
revoke all on all functions in schema erp from public;
grant execute on all functions in schema erp to authenticated;
revoke execute on all functions in schema erp from anon;
grant execute on function erp.public_card(text) to anon;
grant execute on function erp.uid(), erp.is_system(), erp.me(), erp.my_roles(), erp.can(text), erp.setting(text), erp.setting_text(text, text) to anon;
do $$ declare v text; begin
  for v in select viewname from pg_views where schemaname = 'erp' loop
    execute format('revoke all on erp.%I from public, anon', v);
    execute format('grant select on erp.%I to authenticated', v);
  end loop;
end $$;

-- Valeurs par défaut des réglages (n'écrase jamais une valeur existante)
insert into erp.settings(key, value) values
  ('company', '{"name":"Caractère","legal_name":"À renseigner","activity":"Personnalisation textile — DTF, broderie, flocage","address":"Aïn Benian, Alger","phone":"À renseigner","email":"","nif":"À renseigner","nis":"À renseigner","rc":"À renseigner","ai":"À renseigner","rib":"À renseigner","logo_url":"/logo-caractere.svg"}'),
  ('legal_mentions', '"Documents à valider : mentions légales à compléter à partir des documents de référence Caractère."'),
  ('tva_enabled', '"true"'),
  ('tva_rate', '19'),
  ('ref_prefix', '"CAR"'),
  ('prefix_devis', '"DEV"'),
  ('prefix_facture', '"FAC"'),
  ('prefix_bl', '"BL"'),
  ('prefix_recu', '"REC"'),
  ('default_deposit_pct', '50'),
  ('default_promised_days', '7'),
  ('quote_validity_days', '15'),
  ('quote_followup_days', '3'),
  ('reactivation_days', '90'),
  ('characterized_max_width_cm', '30'),
  ('loyalty_offer_text', '"Au prochain achat, vous aurez un T-shirt caractérisé gratuit."'),
  ('loyalty_photo_url', '"/tshirt-caracterise.svg"'),
  ('loyalty_on_counter', '"false"'),
  ('loyalty_min_order', '0'),
  ('whatsapp_templates', '{"nouveau_prospect":"Bonjour {prenom}, ici {commercial} de Caractère (Aïn Benian). Merci pour votre intérêt ! Pouvez-vous m''envoyer votre logo pour une simulation gratuite ?","devis_sans_reponse":"Bonjour {prenom}, je reviens vers vous concernant le devis {ref}. Avez-vous des questions ? Je peux l''ajuster si besoin.","reactivation":"Bonjour {prenom}, ça fait un moment ! Nous avons de nouveaux modèles chez Caractère. Un projet de textile personnalisé en vue ?","incident_livraison":"Bonjour {prenom}, le livreur Yalidine n''a pas pu vous remettre votre colis {ref}. Quand êtes-vous disponible ?","retour_colis":"Bonjour {prenom}, votre colis {ref} nous est revenu. Souhaitez-vous une nouvelle livraison ou un retrait à l''atelier ?","solde":"Bonjour {prenom}, votre commande {ref} est prête. Reste à régler : {solde}.","remboursement":"Bonjour {prenom}, nous revenons vers vous pour le remboursement de la commande {ref}.","pret":"Bonjour {prenom}, votre commande {ref} est prête ! Vous pouvez passer la récupérer à l''atelier Caractère d''Aïn Benian.","autre":"Bonjour {prenom}, ici {commercial} de Caractère."}')
on conflict (key) do nothing;
-- Reprise non destructive des contacts de l'ancien ERP (public.contacts) vers erp.clients.
-- Les tables existantes ne sont ni modifiées ni supprimées ; un contact déjà repris (ou un téléphone déjà connu) est ignoré.
do $$
begin
  if to_regclass('public.contacts') is not null then
    execute $q$
      insert into erp.clients(kind, name, company, phone, phone_raw, email, commune, address, source, notes, legacy_contact_id, created_at)
      select distinct on (coalesce(erp.normalize_phone(c.phone), c.id::text))
             case when c.type::text = 'client' then 'client' else 'prospect' end, c.name, c.company_name, erp.normalize_phone(c.phone), c.phone,
             c.email, c.city, c.address, 'ancien_erp', c.notes, c.id, c.created_at
      from public.contacts c
      where c.type::text in ('client','prospect') and coalesce(btrim(c.name), '') <> ''
      order by coalesce(erp.normalize_phone(c.phone), c.id::text), c.created_at
      on conflict do nothing
    $q$;
  end if;
end $$;

revoke all on function erp.save_quote(jsonb), erp.replace_draft_lines(uuid, jsonb), erp.documents_frozen() from public, anon;
grant execute on function erp.save_quote(jsonb), erp.replace_draft_lines(uuid, jsonb) to authenticated;
insert into erp.schema_migrations(name) values ('0003_erp_orders.sql'), ('0004_erp_delivery_cash.sql'), ('0005_erp_views_security.sql'), ('0006_erp_defaults.sql'), ('0007_erp_legacy_import.sql') on conflict do nothing;
