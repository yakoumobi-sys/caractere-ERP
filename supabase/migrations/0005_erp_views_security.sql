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
