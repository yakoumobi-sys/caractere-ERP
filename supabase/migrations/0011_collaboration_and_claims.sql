-- ============================================================================
-- Collaboration (commentaires) et gestion des réclamations
-- ============================================================================

-- Commentaires sur les commandes (collaboration en temps réel)
create table if not exists public.pipeline_comments (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pipeline_comments enable row level security;
create policy "Users can read comments on orders they have access to"
  on public.pipeline_comments for select
  using (
    exists(select 1 from public.profiles where id = auth.uid() and is_active)
  );
create policy "Users can create comments"
  on public.pipeline_comments for insert
  with check (author_id = auth.uid());

-- Tâches/Checklist de production
create table if not exists public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assigned_to uuid references public.employees(id) on delete set null,
  position int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.production_tasks enable row level security;
create policy "Users can read tasks on production orders"
  on public.production_tasks for select
  using (exists(select 1 from public.profiles where id = auth.uid() and is_active));
create policy "Users can manage tasks"
  on public.production_tasks for all
  using (exists(select 1 from public.profiles where id = auth.uid() and (role = 'admin' or role = 'manager')));

-- Réclamations/Retours
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  issue_type text not null check (issue_type in ('quality', 'damage', 'wrong_order', 'delivery', 'other')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.employees(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.claims enable row level security;
create policy "Users can read claims"
  on public.claims for select
  using (exists(select 1 from public.profiles where id = auth.uid() and is_active));
create policy "Users can manage claims if admin or manager"
  on public.claims for all
  using (exists(select 1 from public.profiles where id = auth.uid() and (role = 'admin' or role = 'manager')));

-- Auto-numérotation pour les réclamations
create or replace function public.generate_claim_number()
returns trigger as $$
begin
  if new.number is null then
    new.number := 'REC-' || to_char(now(), 'YYYY') || '-' || lpad(
      (select coalesce(max(cast(substring(number, 9) as int)), 0) + 1
       from public.claims
       where number like 'REC-' || to_char(now(), 'YYYY') || '-%'),
      5, '0'
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger generate_claim_number_trigger
  before insert on public.claims
  for each row
  execute function public.generate_claim_number();

-- Index pour performance
create index if not exists idx_pipeline_comments_order on public.pipeline_comments(pipeline_order_id);
create index if not exists idx_production_tasks_order on public.production_tasks(pipeline_order_id);
create index if not exists idx_claims_status on public.claims(status);
create index if not exists idx_claims_contact on public.claims(contact_id);
