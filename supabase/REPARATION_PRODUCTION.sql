-- ============================================================================
-- Caractère ERP — Réparation de la base de production
--
-- À coller dans Supabase > SQL Editor > Run.
-- Idempotent : rejouable sans risque, ne supprime aucune donnée métier.
--
-- Établi en comparant le schéma réel de la production (inventaire
-- information_schema + pg_get_functiondef du 2026-08-30) au schéma
-- reconstruit à partir des 34 migrations corrigées.
--
-- Regroupe les migrations que la production n'a jamais reçues, chacune ayant
-- échoué sur une erreur SQL :
--   0012 — vues rapports        (invoices.sales_order_id et
--                                employee_faults.assigned_to inexistantes)
--   0027 — numérotation         (generate_claim_number : changement du type
--                                de retour d'une fonction de trigger)
--   0028 — messagerie, stock,
--          objectifs, SMS,
--          couleurs/tailles     (suppliers déjà créée par 0001, et trois
--                                policies FOR INSERT ... USING invalides)
--   0029b— jeu couleurs/tailles (dépendait de 0028)
--   0031 — variantes produits   (seed sans sku, colonne NOT NULL)
--   0033 — triggers hors migration relevés sur la production :
--          mark_as_paid_on_confirmation écrivait status = 'payee', valeur
--          absente de pipeline_orders_status_check, ce qui faisait échouer
--          TOUTE confirmation de livraison ; auto_journal_entries visait des
--          colonnes inexistantes de journal_entries et ne pouvait jamais
--          s'exécuter.
--
-- (0032, déjà passée sur cette base, n'est pas reprise ici.)
--
-- Vérifications : reconstruction des 34 migrations sur base vierge sans
-- erreur ; ce lot appliqué deux fois sur base migrée sans erreur ; parcours
-- de commande complet — création, impression, prête, livrée, confirmation de
-- livraison — validé sur les triggers de production reproduits à l'identique.
-- ============================================================================



-- ####################  0012_reports_and_exports  ####################

-- ============================================================================
-- Rapports, exports et données historiques pour prévisions
-- ============================================================================

-- Vue pour les statistiques de production (historique)
create or replace view public.production_stats as
select
  date_trunc('day', po.created_at)::date as day,
  po.technique,
  count(*) as order_count,
  count(po.assigned_to) filter (where po.assigned_to is not null) as assigned_count,
  avg(
    extract(epoch from (po.updated_at - po.created_at)) / 3600
  ) filter (where po.status = 'livree') as avg_hours_to_completion,
  count(*) filter (where po.status = 'livree') as completed_count
from public.pipeline_orders po
group by date_trunc('day', po.created_at), po.technique
order by day desc;

-- Vue pour les KPI quotidiens (CA, factures, etc.)
create or replace view public.daily_kpi as
select
  date_trunc('day', i.issue_date)::date as day,
  sum(i.total) as revenue,
  count(distinct i.id) as invoice_count,
  count(distinct case when i.status = 'validee' and i.amount_paid < i.total then i.id end) as unpaid_invoice_count,
  count(distinct po.id) as order_count
from public.invoices i
-- invoices porte la colonne order_id (migration 0001), pas sales_order_id :
-- la vue ne pouvait pas être créée.
left join public.sales_orders so on i.order_id = so.id
left join public.pipeline_orders po on so.contact_id = po.contact_id
  and po.created_at::date = i.issue_date::date
group by date_trunc('day', i.issue_date)
order by day desc;

-- Vue pour les performances employés (au-delà des 14j)
create or replace view public.employee_performance as
select
  e.id,
  e.first_name,
  e.last_name,
  e.department,
  e.color,
  count(distinct psl.id) as total_actions,
  count(distinct psl.pipeline_order_id) as orders_handled,
  count(distinct case when psl.status = 'livree' then psl.pipeline_order_id end) as orders_completed,
  count(distinct ef.id) as total_faults,
  count(distinct case when ef.severity = 'majeure' then ef.id end) as major_faults,
  count(distinct case when ef.severity = 'mineure' then ef.id end) as minor_faults,
  round(
    100.0 * count(distinct case when psl.status = 'livree' then psl.pipeline_order_id end)
    / nullif(count(distinct psl.pipeline_order_id), 0), 2
  ) as completion_rate
from public.employees e
left join public.pipeline_stage_log psl on e.id = (
  select assigned_to from public.pipeline_orders
  where id = psl.pipeline_order_id
)
-- employee_faults porte employee_id (migration 0006), pas assigned_to.
left join public.employee_faults ef on e.id = ef.employee_id
where e.status = 'actif'
group by e.id, e.first_name, e.last_name, e.department, e.color;

-- Configuration d'export (trace des rapports générés)
create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('invoice_pdf', 'quote_pdf', 'production_summary', 'sales_report', 'hr_report')),
  related_entity_id uuid,
  related_entity_type text,
  file_url text,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.generated_reports enable row level security;
drop policy if exists "Users can read reports they generated or admin can see all" on public.generated_reports;
create policy "Users can read reports they generated or admin can see all"
  on public.generated_reports for select
  using (
    generated_by = auth.uid()
    or exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create index if not exists idx_reports_type on public.generated_reports(report_type);
create index if not exists idx_reports_created on public.generated_reports(created_at);


-- ####################  0027_fix_pipeline_order_numbering  ####################

-- ============================================================================
-- Caractère ERP — Corrige la numérotation cassée des commandes de production.
--
-- BUG CRITIQUE : pipeline_orders avait DEUX triggers BEFORE INSERT concurrents
-- pour générer son numéro :
--   - set_order_number   -> auto_number_order()   -> generate_order_number()
--   - set_pipeline_number -> set_pipeline_number() -> next_document_number()
--
-- Les deux ont le même garde-fou "if new.number is null", et comme
-- "set_order_number" < "set_pipeline_number" alphabétiquement, Postgres
-- exécute toujours le premier en premier — le second ne s'est donc jamais
-- déclenché depuis son introduction. Or generate_order_number() calcule le
-- numéro via un simple "count(*) + 1" sur l'année en cours : dès qu'une
-- commande est supprimée (deletePipelineOrder existe et est utilisé) ou que
-- la numérotation dérive un peu, ce compte ne correspond plus aux numéros
-- réellement attribués et finit par recalculer un numéro déjà pris —
-- violation de la contrainte unique pipeline_orders_number_key, qui fait
-- échouer TOUTE création de commande (peu importe client existant ou
-- nouveau), avec une erreur non gérée par l'action serveur.
--
-- generate_order_number() a aussi un bug de format indépendant :
-- format('CMD-%s-%05s', ...) — le spécificateur %s ne remplit PAS les zéros
-- de gauche, contrairement à %d ; il complète avec des ESPACES. D'où les
-- numéros observés en base du style "CMD-2026-    4" (avec espaces au lieu
-- de zéros), déjà visibles avant même la collision fatale.
--
-- Repéré suite au signalement du propriétaire : "je n'arrive pas à créer de
-- commande d'ancien client" / "quand je crée une commande de nouveau client,
-- les infos restent vides" — les deux symptômes viennent du même crash, qui
-- survient après la résolution du client (le contact, lui, est bien créé
-- côté "nouveau client", ce qui explique la confusion).
--
-- Le même bug existe pour claims (auto_number_claim -> generate_claim_number,
-- identique : count(*) + %05s), pas encore déclenché faute de suppression de
-- réclamation à ce jour, mais corrigé ici aussi avant qu'il ne le soit.
-- ============================================================================

-- 1) pipeline_orders : on ne garde que le trigger fiable (next_document_number,
--    compteur atomique en base, déjà utilisé par devis/factures/BC/etc.).
drop trigger if exists set_order_number on public.pipeline_orders;
drop function if exists public.auto_number_order();
drop function if exists public.generate_order_number();

-- 2) Répare les 2 commandes déjà créées avec le schéma bugué (numéros avec
--    espaces, potentiellement en conflit avec le compteur ci-dessous) : on
--    les renumérote à la suite des CMD-P-2026-000N existants, dans l'ordre
--    chronologique de création.
do $$
declare
  r record;
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
begin
  select coalesce(max(substring(number from '\d+$')::int), 0)
    into v_next
    from public.pipeline_orders
    where number ~ ('^CMD-P-' || v_year || '-\d+$');

  for r in
    select id from public.pipeline_orders
    where number !~ ('^CMD-P-' || v_year || '-\d+$')
      and extract(year from created_at)::text = v_year
    order by created_at
  loop
    v_next := v_next + 1;
    update public.pipeline_orders
      set number = 'CMD-P-' || v_year || '-' || lpad(v_next::text, 4, '0')
      where id = r.id;
  end loop;

  -- Aligne le compteur partagé sur le dernier numéro réellement utilisé, pour
  -- que la prochaine vraie commande continue la séquence sans collision.
  insert into public.document_number_counters (prefix, year, last_number)
  values ('CMD-P', v_year, v_next)
  on conflict (prefix, year) do update set last_number = excluded.last_number
  where public.document_number_counters.last_number < excluded.last_number;
end $$;

-- 3) claims : même bug (compteur non atomique + %05s), pas encore déclenché
--    (aucune réclamation créée à ce jour) mais corrigé avant utilisation —
--    aligné sur le schéma commun next_document_number (préfixe "REC").
-- generate_claim_number est une FONCTION DE TRIGGER depuis la migration 0011
-- (trigger generate_claim_number_trigger sur claims). Elle existe en production
-- avec un type de retour qui peut différer de celui-ci. On la droppée d'abord
-- pour pouvoir la recréer : on conserve seulement le calcul racy par le compteur
-- atomique next_document_number.
drop function if exists public.generate_claim_number();
create function public.generate_claim_number()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.number is null then
    new.number := public.next_document_number('REC', 'claims');
  end if;
  return new;
end;
$function$;


-- ####################  0028_add_messaging_supply_chain_objectives  ####################

-- ============================================================================
-- Caractère ERP — Messagerie employés, Supply Chain, et Objectifs du mois
-- ============================================================================

-- 1. MESSAGERIE EMPLOYÉS
create table if not exists public.employee_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.employees(id) on delete cascade,
  recipient_id uuid not null references public.employees(id) on delete cascade,
  content text not null,
  is_read boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_messages_sender_idx on public.employee_messages(sender_id);
create index if not exists employee_messages_recipient_idx on public.employee_messages(recipient_id);
create index if not exists employee_messages_created_idx on public.employee_messages(created_at desc);

-- 2. SUPPLY CHAIN MANAGEMENT
-- suppliers est déjà créée par la migration 0001 : sans "if not exists", ce
-- fichier échouait dès ici et AUCUNE des tables suivantes (messagerie,
-- mouvements de stock, objectifs, couleurs/tailles, SMS) n'était créée.
create table if not exists public.suppliers (
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

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  movement_type text check (movement_type in ('entree', 'sortie', 'ajustement')) not null,
  quantity integer not null,
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);
create index if not exists stock_movements_created_idx on public.stock_movements(created_at desc);

create table if not exists public.purchase_orders (
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
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders(status);

-- 3. OBJECTIFS DU MOIS
create table if not exists public.monthly_objectives (
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
create index if not exists monthly_objectives_month_idx on public.monthly_objectives(month);
create index if not exists monthly_objectives_employee_idx on public.monthly_objectives(employee_id);
create index if not exists monthly_objectives_status_idx on public.monthly_objectives(status);

create table if not exists public.objective_updates (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.monthly_objectives(id) on delete cascade,
  progress_value integer not null,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. UPDATE pipeline_orders pour ajouter liste de couleurs/tailles
-- (Ces données sont déjà dans les items et prints, on ajoute just une table de lookup)
create table if not exists public.product_colors (
  id uuid primary key default gen_random_uuid(),
  color text not null unique,
  hex_value text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_sizes (
  id uuid primary key default gen_random_uuid(),
  size text not null unique,
  category text, -- XS, S, M, L, XL, XXL
  created_at timestamptz not null default now()
);

-- current_user_id() est utilisée par 5 policies de ce fichier (sender_id,
-- employee_id... qui référencent employees.id) mais n'était définie par aucune
-- migration : les policies ci-dessous auraient échoué. Elle renvoie la fiche
-- employé liée au compte connecté, comme le fait déjà l'application
-- (lib/actions/pipeline-actions.ts, currentEmployeeId).
create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where profile_id = auth.uid() limit 1
$$;
revoke execute on function public.current_user_id() from anon;

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
drop policy if exists "employee_messages_select" on public.employee_messages;
create policy "employee_messages_select" on public.employee_messages for select to authenticated
  using (public.is_active_user() and (sender_id = public.current_user_id() or recipient_id = public.current_user_id()));

drop policy if exists "employee_messages_insert" on public.employee_messages;
create policy "employee_messages_insert" on public.employee_messages for insert to authenticated
  with check (public.is_active_user() and sender_id = public.current_user_id());

-- Suppliers: All authenticated users can read
drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers for select to authenticated
  using (public.is_active_user());

drop policy if exists "suppliers_write" on public.suppliers;
create policy "suppliers_write" on public.suppliers for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- Stock movements: All authenticated users can read
drop policy if exists "stock_movements_select" on public.stock_movements;
create policy "stock_movements_select" on public.stock_movements for select to authenticated
  using (public.is_active_user());

drop policy if exists "stock_movements_insert" on public.stock_movements;
create policy "stock_movements_insert" on public.stock_movements for insert to authenticated
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- Purchase orders: All authenticated users can read
drop policy if exists "purchase_orders_select" on public.purchase_orders;
create policy "purchase_orders_select" on public.purchase_orders for select to authenticated
  using (public.is_active_user());

drop policy if exists "purchase_orders_write" on public.purchase_orders;
create policy "purchase_orders_write" on public.purchase_orders for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

-- Objectives: Can read own objectives or common ones
drop policy if exists "monthly_objectives_select" on public.monthly_objectives;
create policy "monthly_objectives_select" on public.monthly_objectives for select to authenticated
  using (public.is_active_user() and (objective_type = 'commun' or employee_id = public.current_user_id()));

drop policy if exists "monthly_objectives_write" on public.monthly_objectives;
create policy "monthly_objectives_write" on public.monthly_objectives for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly' and (objective_type = 'commun' or employee_id = public.current_user_id()))
  with check (public.is_active_user() and public.current_role() <> 'readonly' and (objective_type = 'commun' or employee_id = public.current_user_id()));

-- Product lists: All authenticated users can read
drop policy if exists "product_colors_select" on public.product_colors;
create policy "product_colors_select" on public.product_colors for select to authenticated
  using (public.is_active_user());

drop policy if exists "product_sizes_select" on public.product_sizes;
create policy "product_sizes_select" on public.product_sizes for select to authenticated
  using (public.is_active_user());

-- 6. ALTER pipeline_orders: change flocage logic (default true, uncheck for no flocage)
alter table public.pipeline_orders add column if not exists requires_flocage_v2 boolean default true;
-- Note: Migration will handle data transfer if needed

-- 7. SMS NOTIFICATIONS
create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique,
  message_template text not null,
  description text,
  created_at timestamptz not null default now()
);

-- SMS delivery history
create table if not exists public.sms_delivery (
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
create index if not exists sms_delivery_order_idx on public.sms_delivery(order_id);
create index if not exists sms_delivery_status_idx on public.sms_delivery(status);
create index if not exists sms_delivery_stage_idx on public.sms_delivery(stage);

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

drop policy if exists "sms_templates_select" on public.sms_templates;
create policy "sms_templates_select" on public.sms_templates for select to authenticated
  using (public.is_active_user());

drop policy if exists "sms_delivery_select" on public.sms_delivery;
create policy "sms_delivery_select" on public.sms_delivery for select to authenticated
  using (public.is_active_user());

drop policy if exists "sms_delivery_insert" on public.sms_delivery;
create policy "sms_delivery_insert" on public.sms_delivery for insert to authenticated
  with check (public.is_active_user() and public.current_role() <> 'readonly');


-- ####################  0029_seed_colors_sizes  ####################

-- Seed données: Couleurs et Tailles populaires

-- Couleurs populaires pour vêtements personnalisés
insert into public.product_colors (color, hex_value) values
  ('Noir', '#000000'),
  ('Blanc', '#FFFFFF'),
  ('Rouge', '#FF0000'),
  ('Bleu roi', '#4169E1'),
  ('Bleu nuit', '#001F3F'),
  ('Bleu pétrole', '#0A3D62'),
  ('Gris', '#808080'),
  ('Rose bonbon', '#FF69B4'),
  ('Rose fuchsia', '#FF1493'),
  ('Vert pomme', '#7FBF00'),
  ('Vert bouteille', '#1B4332')
on conflict (color) do nothing;

-- Tailles standards pour vêtements
insert into public.product_sizes (size, category) values
  ('S', 'Standard'),
  ('M', 'Standard'),
  ('L', 'Standard'),
  ('XL', 'Standard'),
  ('XXL', 'Standard'),
  ('XXXL', 'Standard')
on conflict (size) do nothing;


-- ####################  0031_product_cost_and_pricing  ####################

-- ============================================================================
-- Gestion des coûts d'achat et tarification dynamique des produits
-- ============================================================================

-- 1. Ajouter les champs de coûts à la table products
alter table public.products add column if not exists cost_price numeric(12,2);
alter table public.products add column if not exists dtf_cost_per_meter numeric(12,2) default 700;
alter table public.products add column if not exists product_base_name text; -- ex: "tshirt", "polo", "gilet", "totebag"
alter table public.products add column if not exists product_variant text; -- ex: "Djebs", "Palerme", "Col Rond"
alter table public.products add column if not exists requires_dtf boolean default true;
alter table public.products add column if not exists stock_quantity integer default 0;

comment on column public.products.cost_price is 'Coût d''achat du produit';
comment on column public.products.dtf_cost_per_meter is 'Coût DTF par mètre (100cm)';
comment on column public.products.product_base_name is 'Nom de base: tshirt, polo, gilet, totebag';
comment on column public.products.product_variant is 'Variante: Djebs, Palerme, etc';
comment on column public.products.requires_dtf is 'Le produit nécessite-t-il du DTF?';
comment on column public.products.stock_quantity is 'Quantité en stock';

-- 2. Table: Variantes de produits (taille, couleur)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null, -- S, M, L, XL, XXL
  color text not null,
  sku text unique,
  created_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);
create index if not exists product_variants_sku_idx on public.product_variants(sku);

-- 3. Table: Tarification des variantes
create table if not exists public.variant_pricing (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  sale_price numeric(12,2) not null,
  margin_percent numeric(5,2), -- Pourcentage de marge
  margin_amount numeric(12,2), -- Montant de marge fixe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists variant_pricing_variant_idx on public.variant_pricing(product_variant_id);

-- 4. Fonction: Créer automatiquement les variantes quand on crée un produit
create or replace function public.create_product_variants()
returns trigger language plpgsql as $$
declare
  v_size text;
  v_color text;
  v_sku text;
  v_variant_id uuid;
  v_base_price numeric;
  v_cost numeric;
  v_margin numeric;
begin
  -- Ne créer que si product_base_name et product_variant sont définis
  if new.product_base_name is null or new.product_variant is null then
    return new;
  end if;

  -- Les 5 tailles standards
  foreach v_size in array array['S', 'M', 'L', 'XL', 'XXL'] loop
    -- Générer SKU
    v_sku := upper(new.product_base_name) || '-' || new.product_variant || '-' || v_size || '-' || to_char(now(), 'YYYYMMDD');

    -- Créer la variante
    insert into public.product_variants (product_id, size, color, sku)
    values (new.id, v_size, new.product_variant, v_sku)
    returning id into v_variant_id;

    -- Créer la tarification pour cette variante
    -- Base: sale_price du produit
    v_base_price := coalesce(new.sale_price, 0);
    v_cost := coalesce(new.cost_price, 0);
    v_margin := v_base_price - v_cost;

    insert into public.variant_pricing (product_variant_id, sale_price, margin_amount)
    values (v_variant_id, v_base_price, v_margin);
  end loop;

  return new;
end $$;

-- 5. Trigger: Auto-créer les variantes
drop trigger if exists create_product_variants_trigger on public.products;
create trigger create_product_variants_trigger
after insert on public.products
for each row execute function public.create_product_variants();

-- 6. Fonction: Calculer le coût DTF en fonction de la longueur
create or replace function public.calculate_dtf_cost(
  p_product_id uuid,
  p_dtf_length_cm integer
)
returns numeric as $$
declare
  v_dtf_cost_per_meter numeric;
  v_total_cost numeric;
begin
  -- Récupérer le coût DTF par mètre
  select dtf_cost_per_meter into v_dtf_cost_per_meter
  from public.products
  where id = p_product_id;

  if v_dtf_cost_per_meter is null then
    v_dtf_cost_per_meter := 700; -- Défaut: 700 DA/m
  end if;

  -- Calculer: (longueur en cm / 100) × coût par mètre
  v_total_cost := (p_dtf_length_cm::numeric / 100) * v_dtf_cost_per_meter;

  return round(v_total_cost, 2);
end $$ language plpgsql;

-- 7. Fonction: Calculer le prix final avec DTF
create or replace function public.calculate_final_price(
  p_product_id uuid,
  p_dtf_length_cm integer default 0
)
returns numeric as $$
declare
  v_base_price numeric;
  v_cost_price numeric;
  v_dtf_cost numeric;
  v_final_price numeric;
begin
  -- Récupérer prix de vente et coût
  select sale_price, cost_price into v_base_price, v_cost_price
  from public.products
  where id = p_product_id;

  v_base_price := coalesce(v_base_price, 0);
  v_cost_price := coalesce(v_cost_price, 0);

  -- Calculer coût DTF
  v_dtf_cost := public.calculate_dtf_cost(p_product_id, p_dtf_length_cm);

  -- Prix final = Prix de vente + Coût DTF
  v_final_price := v_base_price + v_dtf_cost;

  return round(v_final_price, 2);
end $$ language plpgsql;

-- 8. Données initiales: Produits de base
-- products.sku est NOT NULL (migration 0001) : sans SKU, ce seed faisait
-- echouer la migration et product_variants/variant_pricing n'existaient pas.
insert into public.products (sku, name, product_base_name, product_variant, cost_price, sale_price, unit, tax_rate, track_inventory, is_active)
values
  ('TSH-DJEBS',   'T-shirt Djebs',      'tshirt',  'Djebs',    850, 1950, 'unité', 0, true, true),
  ('TSH-PALERME', 'T-shirt Palerme',    'tshirt',  'Palerme',  650, 1950, 'unité', 0, true, true),
  ('POLO-STD',    'Polo Personnalisé',  'polo',    'Standard', 1050, 2350, 'unité', 0, true, true),
  ('GILET-ROND',  'Gilet Col Rond',     'gilet',   'Col Rond', 1500, 2750, 'unité', 0, true, true),
  ('TOTEBAG-STD', 'Tote Bag',           'totebag', 'Standard', 250, 950, 'unité', 0, true, true)
on conflict (sku) do nothing;

-- 9. RLS pour product_variants et variant_pricing
alter table public.product_variants enable row level security;
alter table public.variant_pricing enable row level security;

drop policy if exists "product_variants_select" on public.product_variants;
create policy "product_variants_select" on public.product_variants for select
  to authenticated using (public.is_active_user());

drop policy if exists "product_variants_write" on public.product_variants;
create policy "product_variants_write" on public.product_variants for all
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager', 'purchasing'));

drop policy if exists "variant_pricing_select" on public.variant_pricing;
create policy "variant_pricing_select" on public.variant_pricing for select
  to authenticated using (public.is_active_user());

drop policy if exists "variant_pricing_write" on public.variant_pricing;
create policy "variant_pricing_write" on public.variant_pricing for all
  to authenticated using (public.is_active_user() and public.current_role() in ('admin', 'manager'))
  with check (public.is_active_user() and public.current_role() in ('admin', 'manager'));


-- ####################  0033_fix_out_of_band_triggers  ####################

-- ============================================================================
-- Caractère ERP — Correction de deux triggers créés hors migration.
--
-- Relevés sur la base de production (pg_get_functiondef, 2026-08-30) : ils
-- n'existaient dans aucun fichier du dépôt, donc n'avaient jamais été relus.
-- Tous deux portent sur pipeline_orders et concernent la fin du parcours de
-- commande (confirmation de livraison, comptabilisation).
--
-- 1. mark_as_paid_on_confirmation — BLOQUANT
--    BEFORE UPDATE, il faisait « new.status := 'payee' ». Or 'payee' ne fait
--    pas partie de pipeline_orders_status_check (migration 0008), qui n'admet
--    que attente_dtf, impression_dtf, attente_broderie, en_broderie,
--    attente_gros, en_preparation_gros, prete, livree.
--    Conséquence : TOUTE mise à jour renseignant delivery_confirmed_at
--    échouait avec « violates check constraint
--    pipeline_orders_status_check » — la confirmation de livraison était donc
--    impossible.
--    L'état de paiement a sa propre colonne depuis la migration 0030
--    (payment_status : unpaid / partial / paid). On y écrit désormais, et on
--    laisse status décrire l'avancement en production, ce qu'il décrit.
--
-- 2. create_journal_entries_for_order — inerte et incorrect
--    AFTER UPDATE, conditionné à « new.status = 'payee' » : depuis la
--    migration 0008 aucune ligne ne peut porter ce statut, donc ce trigger
--    n'a jamais pu s'exécuter. S'il s'exécutait il échouerait, car il insère
--    dans journal_entries les colonnes order_id, account_code, amount et
--    entry_type, alors que la table (migration 0001) porte entry_date,
--    reference, description, source_type, source_id et created_by.
--    La comptabilisation des règlements de commande est déjà assurée, avec le
--    bon schéma, par post_order_payment_journal sur order_payments.
--    On détache donc le trigger. La fonction est conservée telle quelle : si
--    une comptabilisation par commande est souhaitée un jour, elle sera
--    réécrite sur le schéma réel plutôt que rebranchée en l'état.
-- ============================================================================

create or replace function public.mark_as_paid_on_confirmation()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.delivery_confirmed_at is not null and new.paid_at is null then
    new.paid_at := now();
    -- surtout pas new.status : 'payee' viole pipeline_orders_status_check.
    new.payment_status := 'paid';
  end if;
  return new;
end;
$function$;

drop trigger if exists auto_journal_entries on public.pipeline_orders;
