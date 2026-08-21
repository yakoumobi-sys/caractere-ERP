-- ============================================================================
-- Caractère ERP — schéma initial
-- ============================================================================
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin','manager','sales','purchasing','accounting','stock','hr','readonly');
create type public.contact_type as enum ('client','prospect','fournisseur','autre');
create type public.opportunity_stage as enum ('nouveau','qualification','proposition','negociation','gagne','perdu');

-- ----------------------------------------------------------------------------
-- Société & utilisateurs
-- ----------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Caractère',
  siret text,
  address text,
  city text,
  postal_code text,
  country text default 'France',
  phone text,
  email text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'readonly',
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CRM
-- ----------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  type public.contact_type not null default 'client',
  name text not null,
  company_name text,
  email text,
  phone text,
  address text,
  city text,
  postal_code text,
  country text default 'France',
  notes text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_type_idx on public.contacts(type);
create index contacts_owner_idx on public.contacts(owner_id);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  title text not null,
  stage public.opportunity_stage not null default 'nouveau',
  amount numeric(12,2) not null default 0,
  expected_close_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_stage_idx on public.opportunities(stage);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  type text not null default 'note' check (type in ('note','appel','email','reunion')),
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index activities_contact_idx on public.activities(contact_id);

-- ----------------------------------------------------------------------------
-- Catalogue & stock
-- ----------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category_id uuid references public.product_categories(id) on delete set null,
  unit text not null default 'unité',
  sale_price numeric(12,2) not null default 0,
  purchase_cost numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  track_inventory boolean not null default true,
  reorder_point numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity numeric(12,2) not null, -- positif = entrée, négatif = sortie
  type text not null check (type in ('entree','sortie','ajustement','transfert')),
  reference text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_moves_product_idx on public.stock_moves(product_id);
create index stock_moves_warehouse_idx on public.stock_moves(warehouse_id);

-- Niveaux de stock calculés (vue) plutôt que stockés, pour rester toujours cohérents
create view public.product_stock_levels as
  select
    p.id as product_id,
    p.sku,
    p.name,
    w.id as warehouse_id,
    w.name as warehouse_name,
    coalesce(sum(sm.quantity), 0) as quantity
  from public.products p
  cross join public.warehouses w
  left join public.stock_moves sm on sm.product_id = p.id and sm.warehouse_id = w.id
  group by p.id, p.sku, p.name, w.id, w.name;

-- ----------------------------------------------------------------------------
-- Achats
-- ----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  postal_code text,
  country text default 'France',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  status text not null default 'brouillon' check (status in ('brouillon','envoyee','recue','annulee')),
  order_date date not null default current_date,
  expected_date date,
  notes text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_cost numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  received_qty numeric(12,2) not null default 0,
  position int not null default 0
);
create index po_lines_po_idx on public.purchase_order_lines(po_id);

-- ----------------------------------------------------------------------------
-- Ventes & facturation
-- ----------------------------------------------------------------------------
create table public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  contact_id uuid references public.contacts(id) on delete restrict,
  status text not null default 'brouillon' check (status in ('brouillon','envoye','accepte','refuse','expire')),
  quote_date date not null default current_date,
  valid_until date,
  notes text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  position int not null default 0
);
create index quote_lines_quote_idx on public.sales_quote_lines(quote_id);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  quote_id uuid references public.sales_quotes(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete restrict,
  status text not null default 'brouillon' check (status in ('brouillon','confirmee','livree','facturee','annulee')),
  order_date date not null default current_date,
  notes text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  position int not null default 0
);
create index order_lines_order_idx on public.sales_order_lines(order_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  order_id uuid references public.sales_orders(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete restrict,
  status text not null default 'brouillon' check (status in ('brouillon','validee','payee','annulee')),
  issue_date date not null default current_date,
  due_date date,
  notes text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  position int not null default 0
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null default 'virement' check (method in ('virement','carte','especes','cheque','autre')),
  paid_at date not null default current_date,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments(invoice_id);

-- ----------------------------------------------------------------------------
-- Comptabilité (base)
-- ----------------------------------------------------------------------------
create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('actif','passif','charge','produit','capitaux')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  reference text,
  description text,
  source_type text, -- 'invoice' | 'payment' | 'manual' ...
  source_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  label text
);
create index journal_lines_entry_idx on public.journal_lines(entry_id);
create index journal_lines_account_idx on public.journal_lines(account_id);

-- ----------------------------------------------------------------------------
-- RH & Projets (socle, à enrichir)
-- ----------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  position text,
  department text,
  hire_date date,
  status text not null default 'actif' check (status in ('actif','conge','sorti')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'planifie' check (status in ('planifie','en_cours','termine','annule')),
  start_date date,
  end_date date,
  budget numeric(12,2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
