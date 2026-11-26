create or replace function erp.workshop_kpis(p_from date, p_to date)
returns table (
  staff_id uuid,
  full_name text,
  roles text[],
  active boolean,
  orders_started int,
  orders_finished int,
  promised_orders int,
  on_time_orders int,
  avg_hours float8
)
language plpgsql stable security definer set search_path = erp, pg_temp as $$
begin
  perform erp.need('settings');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    raise exception 'La période doit couvrir entre 1 et 366 jours.';
  end if;

  return query
  with bounds as (
    select p_from::timestamp at time zone 'Africa/Algiers' as from_at,
           (p_to + 1)::timestamp at time zone 'Africa/Algiers' as until_at
  ), starts as (
    select distinct on (e.order_id) e.order_id, e.staff_id, e.at
    from erp.order_events e
    where e.kind = 'statut' and e.after->>'status' = 'en_production'
    order by e.order_id, e.at, e.id
  ), started as (
    select e.staff_id, count(*)::int as n
    from starts e cross join bounds b
    where e.at >= b.from_at and e.at < b.until_at
    group by e.staff_id
  ), finished as (
    select event.staff_id, count(*)::int as n,
      count(o.promised_date)::int as promised,
      (count(*) filter (where (o.ready_at at time zone 'Africa/Algiers')::date <= o.promised_date))::int as on_time,
      (avg(extract(epoch from (o.ready_at - st.at)) / 3600)
        filter (where o.ready_at > st.at))::float8 as avg_hours
    from erp.orders o
    join lateral (
      select e.staff_id from erp.order_events e
      where e.order_id = o.id and e.at = o.ready_at and e.kind = 'statut' and e.after->>'status' = 'prete'
      order by e.id desc limit 1
    ) event on true
    left join starts st on st.order_id = o.id
    cross join bounds b
    where o.ready_at >= b.from_at and o.ready_at < b.until_at
    group by event.staff_id
  )
  select s.id, s.full_name, s.roles, s.active, coalesce(a.n, 0), coalesce(f.n, 0),
         coalesce(f.promised, 0), coalesce(f.on_time, 0), f.avg_hours
  from erp.staff s
  left join started a on a.staff_id = s.id
  left join finished f on f.staff_id = s.id
  where s.active or a.n is not null or f.n is not null
  order by coalesce(f.n, 0) desc, coalesce(a.n, 0) desc, s.full_name, s.id;
end $$;

revoke all on function erp.workshop_kpis(date, date) from public, anon;
grant execute on function erp.workshop_kpis(date, date) to authenticated;

notify pgrst, 'reload schema';
