-- Booking : planning semaine (samedi → vendredi) des commandes clients réservées.
create table erp.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_date date not null,
  client_name text not null check (length(trim(client_name)) > 0),
  phone text,
  description text,
  quantity integer check (quantity is null or quantity >= 0),
  amount numeric(12,2) check (amount is null or amount >= 0),
  status text not null default 'reserve' check (status in ('reserve','confirme','fait','annule')),
  notes text,
  created_by uuid references erp.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_date_idx on erp.bookings(booking_date);
alter table erp.bookings enable row level security;
revoke all on erp.bookings from public, anon, authenticated;

create view erp.v_bookings as
  select b.*, s.full_name created_by_name
  from erp.bookings b left join erp.staff s on s.id = b.created_by
  where erp.can('orders_view');
revoke all on erp.v_bookings from public, anon;
grant select on erp.v_bookings to authenticated;

create function erp.booking_add(p jsonb) returns uuid language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('orders_edit'); r uuid;
begin
  if nullif(trim(p->>'client_name'), '') is null then raise exception 'Indiquez le nom du client.'; end if;
  if nullif(p->>'booking_date', '') is null then raise exception 'Date manquante.'; end if;
  insert into erp.bookings(booking_date, client_name, phone, description, quantity, amount, notes, created_by)
  values ((p->>'booking_date')::date, trim(p->>'client_name'), nullif(trim(p->>'phone'), ''), nullif(trim(p->>'description'), ''),
          nullif(p->>'quantity', '')::integer, nullif(p->>'amount', '')::numeric, nullif(trim(p->>'notes'), ''), me)
  returning id into r;
  return r;
end $$;

create function erp.booking_set_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = erp, pg_temp as $$
begin
  perform erp.need('orders_edit');
  if p_status not in ('reserve','confirme','fait','annule') then raise exception 'Statut invalide.'; end if;
  update erp.bookings set status = p_status, updated_at = now() where id = p_id;
  if not found then raise exception 'Réservation introuvable.'; end if;
end $$;

create function erp.booking_delete(p_id uuid) returns void language plpgsql security definer set search_path = erp, pg_temp as $$
begin
  perform erp.need('orders_edit');
  delete from erp.bookings where id = p_id;
end $$;

revoke all on function erp.booking_add(jsonb), erp.booking_set_status(uuid, text), erp.booking_delete(uuid) from public, anon;
grant execute on function erp.booking_add(jsonb), erp.booking_set_status(uuid, text), erp.booking_delete(uuid) to authenticated;
