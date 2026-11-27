create table if not exists erp.daily_operating_costs (
  day date primary key,
  meta_ads numeric(12,2) not null check (meta_ads >= 0),
  employees int not null check (employees >= 0),
  other_costs numeric(12,2) not null check (other_costs >= 0),
  bank_available numeric(12,2),
  updated_by uuid references erp.staff(id),
  updated_at timestamptz not null default now()
);

create table if not exists erp.order_operating_costs (
  order_id uuid primary key references erp.orders(id) on delete cascade,
  dtf_metres numeric(10,3) check (dtf_metres >= 0),
  press_passes int check (press_passes >= 0),
  garments_override numeric(12,2) check (garments_override >= 0),
  other_costs numeric(12,2) check (other_costs >= 0),
  updated_by uuid references erp.staff(id),
  updated_at timestamptz not null default now()
);

alter table erp.daily_operating_costs enable row level security;
alter table erp.order_operating_costs enable row level security;
revoke all on erp.daily_operating_costs, erp.order_operating_costs from public, anon, authenticated;

create or replace function erp.save_daily_operating_costs(p_day date, p_meta numeric, p_employees int, p_other numeric, p_bank numeric) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('settings');
begin
  if p_day is null or p_day > erp.today() then raise exception 'Choisissez une journée passée ou la journée en cours.'; end if;
  insert into erp.daily_operating_costs(day, meta_ads, employees, other_costs, bank_available, updated_by)
  values (p_day, p_meta, p_employees, p_other, p_bank, me)
  on conflict (day) do update set meta_ads = excluded.meta_ads, employees = excluded.employees,
    other_costs = excluded.other_costs, bank_available = excluded.bank_available, updated_by = me, updated_at = now();
end $$;

create or replace function erp.get_daily_operating_costs(p_day date) returns erp.daily_operating_costs
language plpgsql stable security definer set search_path = erp, pg_temp as $$
begin
  perform erp.need('settings');
  return (select d from erp.daily_operating_costs d where d.day = p_day);
end $$;

create or replace function erp.save_order_operating_costs(p_order uuid, p_dtf numeric, p_press int, p_garments numeric, p_other numeric) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('settings');
begin
  insert into erp.order_operating_costs(order_id, dtf_metres, press_passes, garments_override, other_costs, updated_by)
  values (p_order, p_dtf, p_press, p_garments, p_other, me)
  on conflict (order_id) do update set dtf_metres = excluded.dtf_metres, press_passes = excluded.press_passes,
    garments_override = excluded.garments_override, other_costs = excluded.other_costs, updated_by = me, updated_at = now();
end $$;

create or replace function erp.get_order_operating_costs(p_order uuid) returns erp.order_operating_costs
language plpgsql stable security definer set search_path = erp, pg_temp as $$
begin
  perform erp.need('settings');
  return (select c from erp.order_operating_costs c where c.order_id = p_order);
end $$;

create or replace function erp.garment_unit_cost(p_label text, p_catalog numeric) returns numeric
language sql immutable as $$
  select case
    when p_label ~* '(polo.*(long|(^|[^a-z])ml([^a-z]|$)))' then 1300
    when p_label ~* 'polo' then 1000
    when p_label ~* '(t[ -]*shirt|^tsh[- ])' then 700
    when p_label ~* 'gilet' then 1300
    when p_label ~* '(casquette|^casq[- ])' then 400
    when p_label ~* 'tote' then 300
    when p_catalog > 0 then p_catalog
  end
$$;

create or replace function erp.manager_pilotage(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = erp, pg_temp as $$
declare result jsonb;
begin
  perform erp.need('settings');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 or p_to > erp.today() then
    raise exception 'Période invalide.';
  end if;
  with bounds as (
    select p_from::timestamp at time zone 'Africa/Algiers' as from_at, (p_to+1)::timestamp at time zone 'Africa/Algiers' as until_at
  ), delivered as (
    select o.* from erp.orders o cross join bounds b
    where o.delivered_at >= b.from_at and o.delivered_at < b.until_at
  ), order_costs as (
    select o.id, o.total_ht,
      coalesce(c.garments_override, l.cost, 0) garment,
      coalesce(c.dtf_metres * 500, 0) dtf,
      coalesce(c.press_passes * 100::numeric, 0) press,
      case when o.kind <> 'comptoir' then 250 else 0 end commission,
      coalesce(c.other_costs, 0) + coalesce((select sum(s.fee) from erp.shipments s where s.order_id = o.id and s.status <> 'annule'), 0) other,
      ((c.garments_override is null and (l.cost is null or l.unknown))
        or (l.dtf and c.dtf_metres is null) or (l.press and c.press_passes is null)
        or (l.embroidery and c.other_costs is null)) incomplete
    from delivered o left join erp.order_operating_costs c on c.order_id = o.id
    cross join lateral (
      select sum(erp.line_qty(a.sizes) * x.unit_cost) cost, bool_or(x.unit_cost is null) unknown,
        bool_or('dtf'=any(a.services)) dtf, bool_or(a.services && array['dtf','flocage']) press,
        bool_or('broderie'=any(a.services)) embroidery
      from erp.lines a left join erp.products p on p.id=a.product_id
      cross join lateral (select erp.garment_unit_cost(a.label || ' ' || coalesce(p.name,'') || ' ' || coalesce(p.ref,''), p.cost) unit_cost) x
      where a.order_id=o.id
    ) l
  ), paid_refunds as (
    select coalesce(sum(p.amount * o.total_ht / nullif(o.total_ttc, 0)), 0) ht
    from erp.payments p join erp.orders o on o.id=p.order_id cross join bounds b
    where p.kind='remboursement' and p.status in ('confirme','rapproche')
      and p.at >= b.from_at and p.at < b.until_at and o.delivered_at is not null
  ), costs as (
    select coalesce(sum(total_ht),0) - (select ht from paid_refunds) revenue,
      coalesce(sum(garment),0) garment, coalesce(sum(dtf),0) dtf, coalesce(sum(press),0) press,
      coalesce(sum(commission),0) commission, coalesce(sum(other),0) other,
      count(*) filter (where incomplete) missing_orders
    from order_costs
  ), daily as (
    select coalesce(sum(meta_ads),0) meta, coalesce(sum(employees::numeric)*2000,0) labour,
      coalesce(sum(other_costs),0) other, p_to-p_from+1-count(*) missing_days
    from erp.daily_operating_costs d where d.day between p_from and p_to
  ), cash as (
    select case when c.closed_at is null then
      (select coalesce(sum(m.amount),0) from erp.cash_moves m where m.session_id=c.id)
      else c.counted_cash end balance,
      c.closed_at is null open
    from erp.cash_sessions c order by (c.closed_at is null) desc,c.opened_at desc limit 1
  ), prospects as (
    select count(*) prospects, count(*) filter(where exists (
      select 1 from erp.orders o where o.client_id=f.client_id and o.confirmed_at >= f.first_contact
        and o.confirmed_at < b.until_at and o.status not in ('annulee','retournee')
    )) converted
    from (select client_id,min(created_at) first_contact from erp.followups where reason='nouveau_prospect' group by client_id) f
    cross join bounds b where f.first_contact >= b.from_at and f.first_contact < b.until_at
  ), repeat as (
    select count(*) customers,count(*) filter(where previous_purchases >= 2) repeat_buyers from (
      select o.client_id,count(*) previous_purchases from erp.orders o cross join bounds b
      where o.client_id is not null and o.status in ('livree','retiree') and o.delivered_at < b.until_at
      group by o.client_id having bool_or(o.delivered_at >= b.from_at)
    ) customers_in_period
  ), defects as (
    select count(*) incidents, coalesce(sum(d.qty),0) units,
      coalesce(sum(d.qty * x.unit_cost) filter (where d.outcome='perte'),0) lost_cost,
      count(*) filter (where d.outcome='perte' and x.unit_cost is null) missing_cost
    from erp.defects d join erp.lines a on a.id=d.line_id left join erp.products p on p.id=a.product_id
    cross join lateral (select erp.garment_unit_cost(a.label || ' ' || coalesce(p.name,'') || ' ' || coalesce(p.ref,''), p.cost) unit_cost) x
    cross join bounds b where d.at >= b.from_at and d.at < b.until_at
  )
  select jsonb_build_object(
    'revenue', costs.revenue, 'garment', costs.garment, 'dtf', costs.dtf, 'press', costs.press,
    'commission', costs.commission, 'other', costs.other+daily.other, 'meta', daily.meta, 'labour', daily.labour,
    'lost_cost', defects.lost_cost, 'missing_defects', defects.missing_cost,
    'profit', costs.revenue-costs.garment-costs.dtf-costs.press-costs.commission-costs.other-daily.meta-daily.labour-daily.other-defects.lost_cost,
    'missing_orders',costs.missing_orders, 'missing_days',daily.missing_days,
    'cash', (select balance from cash), 'cash_open', (select open from cash),
    'bank', (select bank_available from erp.daily_operating_costs where day=erp.today()),
    'meta_today', (select meta_ads from erp.daily_operating_costs where day=erp.today()),
    'meta_history', (select jsonb_agg(jsonb_build_object('day', ds.day::date, 'amount', expenses.meta_ads) order by ds.day desc)
      from generate_series(p_to-6, p_to, interval '1 day') ds(day)
      left join erp.daily_operating_costs expenses on expenses.day=ds.day::date),
    'late', (select count(*) from erp.orders o where o.promised_date < erp.today() and o.status not in ('livree','retiree','annulee','retournee')),
    'prospects',prospects.prospects,'converted',prospects.converted,
    'customers',repeat.customers,'repeat_buyers',repeat.repeat_buyers,
    'defects',defects.incidents,'defect_units',defects.units
  ) into result from costs,daily,prospects,repeat,defects;
  return result;
end $$;

revoke all on function erp.garment_unit_cost(text,numeric),
  erp.save_daily_operating_costs(date,numeric,int,numeric,numeric), erp.get_daily_operating_costs(date),
  erp.save_order_operating_costs(uuid,numeric,int,numeric,numeric), erp.get_order_operating_costs(uuid),
  erp.manager_pilotage(date,date) from public, anon;
grant execute on function erp.save_daily_operating_costs(date,numeric,int,numeric,numeric), erp.get_daily_operating_costs(date),
  erp.save_order_operating_costs(uuid,numeric,int,numeric,numeric), erp.get_order_operating_costs(uuid),
  erp.manager_pilotage(date,date) to authenticated;
