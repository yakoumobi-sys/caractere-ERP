-- ============================================================================
-- Caractère ERP — Tâches, Absences, Ranking Employés
-- ============================================================================

-- Tables pour Tâches Employés
create table if not exists public.employee_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  deadline date,
  completed_at timestamptz,
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employee_tasks_employee_idx on public.employee_tasks(employee_id);
create index employee_tasks_completed_idx on public.employee_tasks(completed_at);

-- Table pour Absences
create table if not exists public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  absence_date date not null,
  reason text not null,
  notes text,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employee_absences_employee_idx on public.employee_absences(employee_id);
create index employee_absences_date_idx on public.employee_absences(absence_date);

-- Table pour Yalidine Tracking
create table if not exists public.yalidine_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.pipeline_orders(id) on delete cascade,
  yalidine_tracking_id text unique,
  status text check (status in ('pending', 'in_transit', 'delivered', 'failed', 'cancelled')),
  attempted_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index yalidine_shipments_order_idx on public.yalidine_shipments(order_id);
create index yalidine_shipments_tracking_idx on public.yalidine_shipments(yalidine_tracking_id);

-- Triggers pour updated_at
create or replace function public.set_updated_at_tasks()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_tasks before update on public.employee_tasks
  for each row execute function public.set_updated_at_tasks();

create trigger set_updated_at_absences before update on public.employee_absences
  for each row execute function public.set_updated_at_tasks();

create trigger set_updated_at_yalidine before update on public.yalidine_shipments
  for each row execute function public.set_updated_at_tasks();

-- RLS Policies
alter table public.employee_tasks enable row level security;
alter table public.employee_absences enable row level security;
alter table public.yalidine_shipments enable row level security;

-- Lecture: tous les utilisateurs actifs
create policy "employee_tasks_select" on public.employee_tasks for select
  to authenticated using (public.is_active_user());

create policy "employee_absences_select" on public.employee_absences for select
  to authenticated using (public.is_active_user());

create policy "yalidine_shipments_select" on public.yalidine_shipments for select
  to authenticated using (public.is_active_user());

-- Écriture: propriétaire ou admin
create policy "employee_tasks_write" on public.employee_tasks for all
  to authenticated using (
    public.is_active_user() and (
      employee_id = auth.uid() or public.current_role() = 'admin'
    )
  );

create policy "employee_absences_write" on public.employee_absences for all
  to authenticated using (
    public.is_active_user() and (
      employee_id = auth.uid() or public.current_role() = 'admin'
    )
  );

create policy "yalidine_shipments_write" on public.yalidine_shipments for all
  to authenticated using (
    public.is_active_user() and public.current_role() in ('admin', 'sales')
  );
