-- Caractère ERP v2 — schéma "erp" (non destructif : aucune table existante n'est modifiée ou supprimée)
create schema if not exists erp;

-- Réglages (identité, fiscalité, numérotation, paramètres métier)
create table if not exists erp.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists erp.counters (
  key text primary key,
  value integer not null default 0
);

create table if not exists erp.staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique,
  full_name text not null,
  phone text,
  roles text[] not null default '{}',
  can_validate_first_piece boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_roles_chk check (roles <@ array['gerant','commercial','caissier','infographiste','floqueur','brodeur','controleur','magasinier']::text[])
);

create table if not exists erp.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('dtf','presse','brodeuse')),
  laize_cm numeric(5,1),
  active boolean not null default true
);

-- CLIENTS
create table if not exists erp.clients (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'prospect' check (kind in ('prospect','client')),
  name text not null,
  company text,
  phone text,                 -- normalisé +213XXXXXXXXX
  phone_raw text,
  email text,
  wilaya text,
  commune text,
  address text,
  source text not null default 'autre',
  owner_id uuid references erp.staff(id),
  contact_pref text not null default 'whatsapp' check (contact_pref in ('whatsapp','appel','sms','email')),
  marketing_opt_out boolean not null default false,
  opt_out_reason text,
  notes text,
  legacy_contact_id uuid unique,
  created_by uuid references erp.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists clients_phone_uniq on erp.clients(phone) where phone is not null;
create index if not exists clients_name_idx on erp.clients(lower(name));

create table if not exists erp.interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references erp.clients(id) on delete cascade,
  staff_id uuid references erp.staff(id),
  kind text not null check (kind in ('appel','whatsapp','visite','note','simulation','devis','commande','relance','livraison','fidelite','sms','email')),
  summary text not null,
  order_id uuid,
  quote_id uuid,
  at timestamptz not null default now()
);
create index if not exists interactions_client_idx on erp.interactions(client_id, at desc);

-- VENTES
create table if not exists erp.deals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references erp.clients(id) on delete cascade,
  title text not null,
  stage text not null default 'nouveau' check (stage in ('nouveau','a_qualifier','simulation_envoyee','devis_envoye','gagne','perdu')),
  owner_id uuid references erp.staff(id),
  next_action text,
  next_action_date date,
  estimate numeric(12,2),
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists erp.files (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('logo','simulation','bat','accord','photo','autre')),
  client_id uuid references erp.clients(id) on delete set null,
  order_id uuid,
  quote_id uuid,
  deal_id uuid,
  storage text not null default 'local' check (storage in ('local','supabase')),
  path text not null,
  filename text not null,
  mime text,
  size_bytes integer,
  uploaded_by uuid references erp.staff(id),
  created_at timestamptz not null default now()
);

create table if not exists erp.simulations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references erp.clients(id) on delete cascade,
  deal_id uuid references erp.deals(id) on delete set null,
  logo_file_id uuid references erp.files(id),
  mockup_file_id uuid references erp.files(id),
  garment text,
  placement text,
  notes text,
  sent_at timestamptz,
  created_by uuid references erp.staff(id),
  created_at timestamptz not null default now()
);

-- CATALOGUE & STOCK
create table if not exists erp.products (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  name text not null,
  kind text not null default 'vetement' check (kind in ('vetement','consommable')),
  unit text not null default 'pièce',
  sale_price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists erp.stock_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references erp.products(id) on delete cascade,
  color text not null default '',
  size text not null default '',
  physical integer not null default 0,
  reserved integer not null default 0,
  alert_threshold integer not null default 5,
  constraint stock_nonneg check (physical >= 0 and reserved >= 0 and reserved <= physical),
  unique (product_id, color, size)
);

-- COMMANDES (et devis, qui partagent la même référence)
create table if not exists erp.quotes (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  client_id uuid not null references erp.clients(id),
  deal_id uuid references erp.deals(id) on delete set null,
  owner_id uuid references erp.staff(id),
  status text not null default 'brouillon' check (status in ('brouillon','envoye','accepte','refuse','expire')),
  promised_days integer not null default 7,
  deposit_pct numeric(5,2) not null default 50,
  valid_until date,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  refused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists erp.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  client_id uuid references erp.clients(id),
  quote_id uuid unique references erp.quotes(id),
  deal_id uuid references erp.deals(id) on delete set null,
  kind text not null default 'personnalise' check (kind in ('personnalise','vierge','comptoir')),
  status text not null default 'brouillon' check (status in ('brouillon','confirmee','en_production','prete','expediee','a_retirer','livree','retiree','annulee','retournee')),
  blocked_reason text,
  cancel_reason text,
  return_reason text,
  owner_id uuid references erp.staff(id),
  promised_date date,
  delivery_mode text not null default 'retrait' check (delivery_mode in ('retrait','yalidine')),
  ship_name text, ship_phone text, ship_wilaya text, ship_commune text, ship_address text, ship_stopdesk boolean not null default false,
  deposit_pct numeric(5,2) not null default 50,
  deposit_required numeric(12,2) not null default 0,
  deposit_waived_reason text,
  total_ht numeric(12,2) not null default 0,
  total_tva numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  refund_due numeric(12,2) not null default 0,
  rework_note text,
  logo_file_id uuid references erp.files(id),
  bat_file_id uuid references erp.files(id),
  bat_status text not null default 'a_faire' check (bat_status in ('a_faire','envoye','valide','refuse','sans_objet')),
  bat_validated_at timestamptz,
  agreement_file_id uuid references erp.files(id),
  agreement_note text,
  notes text,
  idempotency_key text unique,
  confirmed_at timestamptz,
  confirmed_by uuid references erp.staff(id),
  ready_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references erp.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_client_idx on erp.orders(client_id);
create index if not exists orders_status_idx on erp.orders(status);

-- Lignes : partagées par devis et commandes (quote_id OU order_id)
create table if not exists erp.lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references erp.quotes(id) on delete cascade,
  order_id uuid references erp.orders(id) on delete cascade,
  source_line_id uuid,
  position integer not null default 1,
  product_id uuid references erp.products(id),
  label text not null,
  color text not null default '',
  sizes jsonb not null default '{}'::jsonb,        -- {"M":10,"L":10}
  unit_price numeric(12,2) not null default 0,     -- prix du vêtement HT
  services text[] not null default '{}',            -- dtf, broderie, flocage
  service_price numeric(12,2) not null default 0,   -- prestation HT par pièce
  discount_pct numeric(5,2) not null default 0,
  placement text,
  print_width_cm numeric(5,1),
  is_characterized boolean not null default false,  -- concept T-shirt caractérisé
  is_gift boolean not null default false,
  produced integer not null default 0,
  delivered jsonb not null default '{}'::jsonb,
  constraint line_owner check ((quote_id is null) <> (order_id is null)),
  constraint line_services check (services <@ array['dtf','broderie','flocage']::text[]),
  constraint line_discount check (discount_pct between 0 and 100)
);
create index if not exists lines_order_idx on erp.lines(order_id);
create index if not exists lines_quote_idx on erp.lines(quote_id);

create table if not exists erp.reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references erp.orders(id) on delete cascade,
  line_id uuid not null references erp.lines(id) on delete cascade,
  item_id uuid not null references erp.stock_items(id),
  size text not null default '',
  qty integer not null check (qty > 0),
  status text not null default 'active' check (status in ('active','consommee','liberee')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists reservations_line_idx on erp.reservations(line_id, status);

create table if not exists erp.stock_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references erp.stock_items(id),
  qty integer not null,                 -- signé, variation du stock physique
  kind text not null check (kind in ('reception','sortie_atelier','sortie_client','retour','inventaire','perte','correction')),
  order_id uuid references erp.orders(id),
  reason text,
  staff_id uuid references erp.staff(id),
  at timestamptz not null default now()
);
create index if not exists stock_moves_item_idx on erp.stock_moves(item_id, at desc);

create table if not exists erp.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references erp.stock_items(id),
  qty integer not null check (qty > 0),
  reason text not null,
  order_id uuid references erp.orders(id),
  status text not null default 'a_valider' check (status in ('a_valider','validee','refusee','recue')),
  requested_by uuid references erp.staff(id),
  decided_by uuid references erp.staff(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists purchase_open_uniq on erp.purchase_requests(item_id) where status = 'a_valider';

create table if not exists erp.order_events (
  id bigserial primary key,
  order_id uuid not null references erp.orders(id) on delete cascade,
  staff_id uuid references erp.staff(id),
  kind text not null,
  before jsonb,
  after jsonb,
  note text,
  at timestamptz not null default now()
);
create index if not exists order_events_idx on erp.order_events(order_id, at);

-- ATELIER
create table if not exists erp.tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references erp.orders(id) on delete cascade,
  line_id uuid not null references erp.lines(id) on delete cascade,
  step text not null check (step in ('preparation_fichier','impression_dtf','flocage','broderie','preparation','controle','emballage')),
  seq integer not null,
  station text not null check (station in ('infographie','dtf','presse','broderie','magasin','controle','emballage')),
  assignee_id uuid references erp.staff(id),
  machine_id uuid references erp.machines(id),
  status text not null default 'a_faire' check (status in ('a_faire','en_cours','bloquee','terminee','annulee')),
  qty_target integer not null default 0,
  qty_done integer not null default 0,
  needs_first_piece boolean not null default false,
  first_piece_status text not null default 'na' check (first_piece_status in ('na','a_valider','validee','refusee')),
  first_piece_by uuid references erp.staff(id),
  first_piece_at timestamptz,
  priority integer not null default 0,
  priority_note text,
  started_by uuid references erp.staff(id), started_at timestamptz,
  finished_by uuid references erp.staff(id), finished_at timestamptz,
  blocked_by uuid references erp.staff(id), blocked_at timestamptz,
  blocked_reason text,
  notify_staff_id uuid references erp.staff(id),
  rework_pending integer not null default 0,
  created_at timestamptz not null default now(),
  unique (line_id, step)
);
create index if not exists tasks_station_idx on erp.tasks(station, status);

create table if not exists erp.task_log (
  id bigserial primary key,
  task_id uuid not null references erp.tasks(id) on delete cascade,
  staff_id uuid references erp.staff(id),
  action text not null,
  note text,
  at timestamptz not null default now()
);

create table if not exists erp.defects (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references erp.tasks(id),
  order_id uuid not null references erp.orders(id),
  line_id uuid not null references erp.lines(id),
  size text not null default '',
  qty integer not null check (qty > 0),
  defect text not null,
  outcome text not null check (outcome in ('reprise','perte')),
  staff_id uuid references erp.staff(id),
  at timestamptz not null default now()
);

-- LIVRAISON
create table if not exists erp.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references erp.orders(id),
  number integer not null,
  mode text not null check (mode in ('yalidine','retrait')),
  tracking text unique,
  status text not null default 'preparation' check (status in ('preparation','expedie','en_transit','livre','echec','retour','retire','annule')),
  cod_amount numeric(12,2) not null default 0,
  fee numeric(12,2) not null default 0,
  attempts integer not null default 0,
  last_event_at timestamptz,
  last_event_label text,
  return_restocked boolean not null default false,
  created_by uuid references erp.staff(id),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (order_id, number)
);

create table if not exists erp.shipment_lines (
  shipment_id uuid not null references erp.shipments(id) on delete cascade,
  line_id uuid not null references erp.lines(id),
  size text not null default '',
  qty integer not null check (qty > 0),
  primary key (shipment_id, line_id, size)
);

create table if not exists erp.carrier_events (
  id uuid primary key default gen_random_uuid(),
  carrier text not null default 'yalidine',
  external_id text not null,
  tracking text not null,
  shipment_id uuid references erp.shipments(id),
  status text not null,
  label text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  outcome text,                  -- applique, ignore_ancien, inconnu
  raw jsonb,
  unique (carrier, external_id)
);

-- FIDÉLITÉ
create table if not exists erp.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references erp.clients(id),
  number text not null unique,
  token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  first_order_id uuid references erp.orders(id),
  issued_at timestamptz not null default now()
);

create table if not exists erp.loyalty_benefits (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references erp.loyalty_cards(id),
  source_order_id uuid not null unique references erp.orders(id),
  label text not null default 'T-shirt caractérisé offert',
  status text not null default 'disponible' check (status in ('disponible','utilise','annule')),
  used_order_id uuid unique references erp.orders(id),
  used_by uuid references erp.staff(id),
  used_at timestamptz,
  issued_at timestamptz not null default now()
);

-- RELANCES
create table if not exists erp.followups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references erp.clients(id) on delete cascade,
  order_id uuid references erp.orders(id) on delete cascade,
  quote_id uuid references erp.quotes(id) on delete cascade,
  shipment_id uuid references erp.shipments(id),
  owner_id uuid references erp.staff(id),
  due_date date not null,
  reason text not null check (reason in ('nouveau_prospect','devis_sans_reponse','reactivation','incident_livraison','retour_colis','solde','remboursement','reprise','autre')),
  is_marketing boolean not null default false,
  status text not null default 'a_faire' check (status in ('a_faire','fait','annule')),
  result text,
  note text,
  done_by uuid references erp.staff(id),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists followups_due_idx on erp.followups(status, due_date);
create unique index if not exists followups_open_uniq on erp.followups(client_id, reason, coalesce(order_id, quote_id, shipment_id, client_id)) where status = 'a_faire';

-- CAISSE & RÈGLEMENTS
create table if not exists erp.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid references erp.staff(id),
  opened_at timestamptz not null default now(),
  opening_float numeric(12,2) not null default 0,
  closed_by uuid references erp.staff(id),
  closed_at timestamptz,
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  gap numeric(12,2),
  close_note text
);
create unique index if not exists cash_one_open on erp.cash_sessions((true)) where closed_at is null;

create table if not exists erp.remittances (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  received_on date not null,
  amount_received numeric(12,2) not null,
  cod_total numeric(12,2) not null default 0,
  fees_total numeric(12,2) not null default 0,
  expected numeric(12,2) not null default 0,
  gap numeric(12,2) not null default 0,
  note text,
  staff_id uuid references erp.staff(id),
  created_at timestamptz not null default now()
);

create table if not exists erp.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references erp.orders(id),
  client_id uuid references erp.clients(id),
  kind text not null check (kind in ('acompte','paiement','solde','remboursement')),
  method text not null check (method in ('especes','ccp','baridimob','virement','cheque','tpe','yalidine_cod')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'confirme' check (status in ('attendu','confirme','encaisse_transporteur','rapproche','annule')),
  shipment_id uuid references erp.shipments(id),
  remittance_id uuid references erp.remittances(id),
  cash_session_id uuid references erp.cash_sessions(id),
  receipt_number text unique,
  idempotency_key text unique,
  note text,
  staff_id uuid references erp.staff(id),
  at timestamptz not null default now()
);
create index if not exists payments_order_idx on erp.payments(order_id);
create unique index if not exists payments_cod_uniq on erp.payments(shipment_id) where method = 'yalidine_cod' and status <> 'annule';

create table if not exists erp.cash_moves (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references erp.cash_sessions(id),
  kind text not null check (kind in ('fond','encaissement','depense','remboursement','correction','retrait')),
  amount numeric(12,2) not null,        -- signé : + entre en caisse, - sort
  payment_id uuid references erp.payments(id),
  label text not null,
  staff_id uuid references erp.staff(id),
  at timestamptz not null default now()
);

create table if not exists erp.remittance_items (
  remittance_id uuid not null references erp.remittances(id),
  shipment_id uuid not null unique references erp.shipments(id),
  cod_amount numeric(12,2) not null,
  fee numeric(12,2) not null default 0,
  primary key (remittance_id, shipment_id)
);

-- DOCUMENTS (figés)
create table if not exists erp.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('devis','facture','bon_livraison','recu')),
  number text not null unique,
  version integer not null default 1,
  order_id uuid references erp.orders(id),
  quote_id uuid references erp.quotes(id),
  shipment_id uuid references erp.shipments(id),
  payment_id uuid references erp.payments(id),
  status text not null default 'emis' check (status in ('emis','remplace')),
  replaces_id uuid references erp.documents(id),
  correction_reason text,
  snapshot jsonb not null,
  total_ttc numeric(12,2),
  issued_by uuid references erp.staff(id),
  issued_at timestamptz not null default now()
);
create unique index if not exists documents_one_active_bl on erp.documents(shipment_id) where kind = 'bon_livraison' and status = 'emis';
create unique index if not exists documents_one_active_receipt on erp.documents(payment_id) where kind = 'recu' and status = 'emis';

create table if not exists erp.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
