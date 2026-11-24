-- Planning de réservation des commandes clients : une ligne = une commande
-- bookée sur un jour donné (vue semaine samedi → vendredi).
create table if not exists public.order_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_date date not null,
  client_name text not null,
  phone text,
  description text,
  quantity integer check (quantity is null or quantity >= 0),
  amount numeric(12,2) check (amount is null or amount >= 0),
  status text not null default 'reserve'
    check (status in ('reserve', 'confirme', 'fait', 'annule')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_bookings_date_idx on public.order_bookings(booking_date);

alter table public.order_bookings enable row level security;

drop policy if exists "order_bookings_select" on public.order_bookings;
create policy "order_bookings_select" on public.order_bookings for select to authenticated
  using (public.is_active_user());

drop policy if exists "order_bookings_write" on public.order_bookings;
create policy "order_bookings_write" on public.order_bookings for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

grant select, insert, update, delete on public.order_bookings to authenticated;
