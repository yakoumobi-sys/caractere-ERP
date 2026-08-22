-- ============================================================================
-- Caractère ERP — données de démarrage
-- À exécuter une fois après les migrations (Supabase SQL editor ou CLI).
-- ============================================================================

insert into public.companies (name, country) values ('Caractère', 'France')
  on conflict do nothing;

insert into public.warehouses (name, is_default) values ('Entrepôt principal', true)
  on conflict do nothing;

-- Plan comptable simplifié (PCG français) — nécessaire pour la comptabilisation automatique
insert into public.chart_of_accounts (code, name, type) values
  ('411', 'Clients', 'actif'),
  ('401', 'Fournisseurs', 'passif'),
  ('512', 'Banque', 'actif'),
  ('530', 'Caisse', 'actif'),
  ('606', 'Achats non stockés', 'charge'),
  ('607', 'Achats de marchandises', 'charge'),
  ('706', 'Ventes de prestations', 'produit'),
  ('707', 'Ventes de marchandises', 'produit'),
  ('4457', 'TVA collectée', 'passif'),
  ('4456', 'TVA déductible', 'actif'),
  ('641', 'Rémunérations du personnel', 'charge'),
  ('101', 'Capital', 'capitaux')
on conflict (code) do nothing;

insert into public.product_categories (name) values
  ('Général'),
  ('Services'),
  ('Marchandises')
on conflict do nothing;

-- Équipe Caractère, positionnée sur le parcours de commande :
-- WhatsApp -> Commercial -> Atelier DTF / Broderie -> Flocage -> retour Commercial -> Client
insert into public.employees (first_name, last_name, position, department) values
  ('Lilia', '', 'Réception commandes WhatsApp', 'Réception WhatsApp'),
  ('Lydia', '', 'Réception commandes WhatsApp', 'Réception WhatsApp'),
  ('Kholoud', '', 'Commercial', 'Commercial'),
  ('Abderahmane', '', 'Commercial', 'Commercial'),
  ('Hafid', '', 'Commercial', 'Commercial'),
  ('Imene', '', 'Atelier DTF', 'Atelier DTF'),
  ('Nesro', '', 'Atelier DTF', 'Atelier DTF'),
  ('Manel', '', 'Atelier Broderie', 'Atelier Broderie'),
  ('Ikram', '', 'Atelier Flocage', 'Atelier Flocage'),
  ('Hanane', '', 'Atelier Flocage', 'Atelier Flocage'),
  ('Aymen', '', 'Atelier Flocage', 'Atelier Flocage')
on conflict do nothing;
