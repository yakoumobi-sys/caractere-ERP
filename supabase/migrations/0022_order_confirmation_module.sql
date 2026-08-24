-- ============================================================================
-- Caractère ERP — Confirmation de commandes (inspiré CodPilot / djebs store)
-- File d'appel pour confirmer les commandes COD/web avant fulfillment :
-- Nouveau -> tentatives d'appel -> Confirmée / Annulée / etc.
-- ============================================================================

create table if not exists public.order_confirmations (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  contact_id uuid references public.contacts(id) on delete set null,
  product_description text not null,
  quantity numeric(12,2) not null default 1,
  sales_channel text,
  source_utm text,
  tracking_id text,
  confirmation_status text not null default 'nouveau' check (confirmation_status in (
    'nouveau','a_verifier','a_confirmer','appel_1','appel_2','appel_3',
    'appel_2_1','appel_2_2','appel_2_3','appel_2_4','appel_4_sms',
    'confirmee','confirmee_bot','confirmee_rupture_stock',
    'annulee','double','fausse_commande','reporte','injoignable'
  )),
  call_attempts int not null default 0,
  assigned_to uuid references public.employees(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_confirmations_status_idx on public.order_confirmations(confirmation_status);
create index if not exists order_confirmations_assigned_idx on public.order_confirmations(assigned_to);
create index if not exists order_confirmations_created_idx on public.order_confirmations(created_at);

create or replace function public.set_order_confirmation_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.number is null then
    new.number := public.next_document_number('COD', 'order_confirmations');
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_confirmation_number_trigger on public.order_confirmations;
create trigger set_order_confirmation_number_trigger
  before insert on public.order_confirmations
  for each row execute function public.set_order_confirmation_number();

drop trigger if exists set_updated_at on public.order_confirmations;
create trigger set_updated_at before update on public.order_confirmations
  for each row execute function public.set_updated_at();

alter table public.order_confirmations enable row level security;

drop policy if exists "order_confirmations_select" on public.order_confirmations;
create policy "order_confirmations_select" on public.order_confirmations for select
  to authenticated using (public.is_active_user());

drop policy if exists "order_confirmations_write" on public.order_confirmations;
create policy "order_confirmations_write" on public.order_confirmations for all
  to authenticated using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

grant execute on function public.set_order_confirmation_number() to authenticated;
