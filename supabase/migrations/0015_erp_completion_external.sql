alter table erp.lines add column if not exists external_supply jsonb not null default '{}'::jsonb;

create or replace function erp.reserve_line(p_line uuid) returns integer language plpgsql as $$
declare l record; s record; it record; have int; need int; take int; missing int := 0;
begin
  select * into l from erp.lines where id = p_line;
  if l.product_id is null then return 0; end if;
  for s in select key size, value::int qty from jsonb_each_text(l.sizes) loop
    select coalesce(sum(qty), 0) into have from erp.reservations where line_id = p_line and size = s.size and status in ('active','consommee');
    need := s.qty - have - coalesce((l.external_supply->>s.size)::int, 0);
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
  select coalesce(jsonb_object_agg(s.key, s.qty - coalesce(r.q, 0) - coalesce((l.external_supply->>s.key)::int, 0)) filter (where s.qty - coalesce(r.q, 0) - coalesce((l.external_supply->>s.key)::int, 0) > 0), '{}'::jsonb)
  from erp.lines l
  cross join lateral (select key, value::int qty from jsonb_each_text(l.sizes)) s
  left join lateral (select sum(qty) q from erp.reservations r where r.line_id = l.id and r.size = s.key and r.status in ('active','consommee')) r on true
  where l.id = p_line and l.product_id is not null
$$;

create or replace function erp.finish_order(p_order uuid) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare o record; t record; result text;
begin
  perform erp.need('workshop_work');
  select * into o from erp.orders where id = p_order;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status = 'brouillon' then raise exception 'Confirmez d''abord la commande.'; end if;
  if o.status not in ('confirmee','en_production') then raise exception 'Commande déjà %.', o.status; end if;
  if exists (select 1 from erp.tasks where order_id = p_order and status = 'bloquee') then
    raise exception 'Une tâche est bloquée : débloquez-la avant de terminer la commande.';
  end if;
  loop
    select x.* into t from erp.tasks x where x.order_id = p_order and x.status in ('a_faire','en_cours')
      and not exists (select 1 from erp.tasks p where p.line_id = x.line_id and p.seq < x.seq and p.status not in ('terminee','annulee'))
      order by x.line_id, x.seq limit 1;
    exit when not found;
    if t.status = 'a_faire' then perform erp.start_task(t.id); end if;
    if t.needs_first_piece then
      update erp.tasks set first_piece_status = 'validee', first_piece_by = erp.me(), first_piece_at = now() where id = t.id and first_piece_status <> 'validee';
    end if;
    perform erp.finish_task(t.id);
  end loop;
  select status into result from erp.orders where id = p_order;
  if result <> 'prete' then
    raise exception 'La commande reste en cours : vérifiez que chaque article a une tâche à terminer.';
  end if;
  return result;
end $$;

create or replace function erp.complete_order_external(p_order uuid, p_reason text) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare o record; l record; missing jsonb;
begin
  perform erp.need('settings');
  if nullif(btrim(p_reason), '') is null then raise exception 'Précisez la provenance des articles hors stock.'; end if;
  select status into o from erp.orders where id = p_order for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status in ('brouillon','confirmee','en_production') then
    for l in select id, external_supply from erp.lines where order_id = p_order order by position for update loop
      missing := erp.line_missing(l.id);
      if missing <> '{}'::jsonb then
        update erp.lines set external_supply = (
          select jsonb_object_agg(size, qty) from (
            select size, sum(qty)::int as qty from (
              select key as size, value::int as qty from jsonb_each_text(l.external_supply)
              union all
              select key, value::int from jsonb_each_text(missing)
            ) amounts group by size
          ) by_size
        ) where id = l.id;
        perform erp.log_order(p_order, 'approvisionnement_externe', null,
          jsonb_build_object('ligne', l.id, 'quantites', missing), left(btrim(p_reason), 300));
      end if;
    end loop;
  end if;
  return erp.complete_order(p_order);
end $$;

revoke all on function erp.complete_order_external(uuid,text) from public, anon;
grant execute on function erp.complete_order_external(uuid,text) to authenticated;
