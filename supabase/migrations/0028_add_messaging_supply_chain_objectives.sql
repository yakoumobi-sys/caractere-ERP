-- ============================================================================
-- Caractère ERP — Messagerie employés, Supply Chain, et Objectifs du mois
-- ============================================================================

-- 1. MESSAGERIE EMPLOYÉS
create table public.employee_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.employees(id) on delete cascade,
  recipient_id uuid not null references public.employees(id) on delete cascade,
  content text not null,
  is_read boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employee_messages_sender_idx on public.employee_messages(sender_id);
create index employee_messages_recipient_idx on public.employee_messages(recipient_id);
create index employee_messages_created_idx on public.employee_messages(created_at desc);

-- 2. SUPPLY CHAIN MANAGEMENT
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  payment_terms text,
  lead_time_days integer,
  status text check (status in ('actif', 'inactif')) default 'actif',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  movement_type text check (movement_type in ('entree', 'sortie', 'ajustement')) not null,
  quantity integer not null,
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements(product_id);
create index stock_movements_created_idx on public.stock_movements(created_at desc);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text check (status in ('brouillon', 'commandee', 'recue', 'annulee')) default 'brouillon',
  total_amount decimal(12, 2),
  expected_delivery_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index purchase_orders_status_idx on public.purchase_orders(status);

-- 3. OBJECTIFS DU MOIS
create table public.monthly_objectives (
  id uuid primary key default gen_random_uuid(),
  month text not null, -- format: '2026-01'
  objective_type text check (objective_type in ('commun', 'individuel')) not null,
  title text not null,
  description text,
  target_value integer,
  employee_id uuid references public.employees(id) on delete cascade,
  progress_value integer default 0,
  status text check (status in ('planification', 'en_cours', 'completed', 'missed')) default 'en_cours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index monthly_objectives_month_idx on public.monthly_objectives(month);
create index monthly_objectives_employee_idx on public.monthly_objectives(employee_id);
create index monthly_objectives_status_idx on public.monthly_objectives(status);

create table public.objective_updates (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.monthly_objectives(id) on delete cascade,
  progress_value integer not null,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. UPDATE pipeline_orders pour ajouter liste de couleurs/tailles
-- (Ces données sont déjà dans les items et prints, on ajoute just une table de lookup)
create table public.product_colors (
  id uuid primary key default gen_random_uuid(),
  color text not null unique,
  hex_value text,
  created_at timestamptz not null default now()
);

create table public.product_sizes (
  id uuid primary key default gen_random_uuid(),
  size text not null unique,
  category text, -- XS, S, M, L, XL, XXL
  created_at timestamptz not null default now()
);

-- 5. RLS POLICIES
alter table public.employee_messages enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.monthly_objectives enable row level security;
alter table public.objective_updates enable row level security;
alter table public.product_colors enable row level security;
alter table public.product_sizes enable row level security;

-- Messages: Can read own messages
create policy "employee_messages_select" on public.employee_messages for select to authenticated
  using (public.is_active_user() and (sender_id = public.current_user_id() or recipient_id = public.current_user_id()));

create policy "employee_messages_insert" on public.employee_messages for insert to authenticated
  using (public.is_active_user() and sender_id = public.current_user_id());

-- Suppliers: All authenticated users can read
create policy "suppliers_select" on public.suppliers for select to authenticated
  using (public.is_active_user());

create policy "suppliers_write" on public.suppliers for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- Stock movements: All authenticated users can read
create policy "stock_movements_select" on public.stock_movements for select to authenticated
  using (public.is_active_user());

create policy "stock_movements_insert" on public.stock_movements for insert to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly');

-- Purchase orders: All authenticated users can read
create policy "purchase_orders_select" on public.purchase_orders for select to authenticated
  using (public.is_active_user());

create policy "purchase_orders_write" on public.purchase_orders for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- Objectives: Can read own objectives or common ones
create policy "monthly_objectives_select" on public.monthly_objectives for select to authenticated
  using (public.is_active_user() and (objective_type = 'commun' or employee_id = public.current_user_id()));

create policy "monthly_objectives_write" on public.monthly_objectives for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly' and (objective_type = 'commun' or employee_id = public.current_user_id()))
  with check (public.is_active_user() and public.current_role() <> 'readonly' and (objective_type = 'commun' or employee_id = public.current_user_id()));

-- Product lists: All authenticated users can read
create policy "product_colors_select" on public.product_colors for select to authenticated
  using (public.is_active_user());

create policy "product_sizes_select" on public.product_sizes for select to authenticated
  using (public.is_active_user());

-- 6. ALTER pipeline_orders: change flocage logic (default true, uncheck for no flocage)
alter table public.pipeline_orders add column if not exists requires_flocage_v2 boolean default true;
-- Note: Migration will handle data transfer if needed

-- 7. SMS NOTIFICATIONS
create table public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique,
  message_template text not null,
  description text,
  created_at timestamptz not null default now()
);

-- SMS delivery history
create table public.sms_delivery (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  customer_phone text not null,
  stage text not null,
  message text,
  status text check (status in ('pending', 'sent', 'failed', 'undelivered')) default 'pending',
  twilio_sid text,
  attempt_number integer default 1,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index sms_delivery_order_idx on public.sms_delivery(order_id);
create index sms_delivery_status_idx on public.sms_delivery(status);
create index sms_delivery_stage_idx on public.sms_delivery(stage);

-- Insert default SMS templates
insert into public.sms_templates (stage, message_template, description) values
  ('production', 'Bonjour! Votre commande #{{order_number}} est en cours de production. Merci pour votre confiance. 🎨', 'Commande en production'),
  ('ready_for_shipment', 'Bonne nouvelle! Votre commande #{{order_number}} est prête à livrer et sera expédiée demain. 📦', 'Commande prête à livrer'),
  ('in_transit', 'Votre colis est en route! 🚚 Suivez-le: {{tracking_url}}', 'Colis en route'),
  ('arrived_wilaya', 'Votre colis est arrivé à la wilaya. Le livreur vous contactera sous 24h. ⏰', 'Colis arrivé à la wilaya'),
  ('delivered', 'Merci pour votre confiance! 🎁 Profitez de -2000 DA sur votre prochaine commande. Code: MERCI2000', 'Livraison réussie'),
  ('delivery_failed_1', 'Notre livreur n''a pas pu vous joindre. SVP appelez-le ou rappelez pour recevoir votre commande. 📞 Support: {{support_phone}}', 'Tentative échouée 1'),
  ('delivery_failed_2', 'Dernière tentative: le livreur repassera demain entre 9h-17h. SVP soyez disponible! 🏠', 'Tentative échouée 2'),
  ('delivery_failed_3', 'Livraison impossible après 3 tentatives. Contactez-nous: support@caractere.com ou 0XXX-XXX-XXX', 'Tentative échouée 3'),
  ('delivery_failed_final', 'Votre colis a été retourné à nos locaux. Contactez-nous pour organiser une nouvelle livraison ou remboursement. 💬', 'Échec livraison définitif')
on conflict (stage) do nothing;

-- RLS for SMS
alter table public.sms_templates enable row level security;
alter table public.sms_delivery enable row level security;

create policy "sms_templates_select" on public.sms_templates for select to authenticated
  using (public.is_active_user());

create policy "sms_delivery_select" on public.sms_delivery for select to authenticated
  using (public.is_active_user());

create policy "sms_delivery_insert" on public.sms_delivery for insert to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');
