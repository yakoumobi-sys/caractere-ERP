-- ============================================================================
-- Caractère ERP — Module Alertes : Examiner -> Acheter -> Terminer,
-- + alertes automatiques (commandes en retard, échecs Yalidine)
-- ============================================================================

alter table public.supply_alerts add column if not exists supply_type_id uuid references public.supply_types(id) on delete set null;
alter table public.supply_alerts add column if not exists purchase_price numeric(12,2);
alter table public.supply_alerts add column if not exists delivery_cost numeric(12,2);
alter table public.supply_alerts add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null;
alter table public.supply_alerts add column if not exists pipeline_order_id uuid references public.pipeline_orders(id) on delete cascade;

-- Numérotation atomique (remplace le count(*) racy de generate_alert_number).
create or replace function public.generate_alert_number()
returns text language plpgsql set search_path = public as $$
begin
  return public.next_document_number('ALR', 'supply_alerts');
end;
$$;

-- "Acheter" : enregistre le prix d'achat + livraison, crée la commande fournisseur
-- correspondante (Achats) et son mouvement de caisse (comptabilisation : débit
-- 607 Achats de marchandises / crédit 530 Caisse), passe l'alerte au statut
-- "commandee". SECURITY DEFINER : la comptabilisation reste restreinte à
-- admin/accounting en écriture directe (0003_rls.sql), mais ce flux métier
-- précis, déclenchable par n'importe quel utilisateur actif non-readonly,
-- doit pouvoir la produire — comme les autres triggers de comptabilisation
-- automatique (post_invoice_journal, post_payment_journal...).
create or replace function public.supply_alert_buy(
  p_alert_id uuid,
  p_supplier_id uuid,
  p_purchase_price numeric,
  p_delivery_cost numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_alert public.supply_alerts%rowtype;
  v_po_id uuid;
  v_entry_id uuid;
  v_acc_achat uuid;
  v_acc_caisse uuid;
  v_total numeric(12,2) := coalesce(p_purchase_price, 0) + coalesce(p_delivery_cost, 0);
  v_uid uuid := auth.uid();
begin
  if not public.is_active_user() or public.current_role() = 'readonly' then
    raise exception 'Non autorisé';
  end if;

  select * into v_alert from public.supply_alerts where id = p_alert_id;
  if v_alert.id is null then
    raise exception 'Alerte introuvable';
  end if;
  if v_alert.status not in ('ouverte', 'en_cours') then
    raise exception 'Cette alerte a déjà été traitée (statut: %)', v_alert.status;
  end if;

  insert into public.purchase_orders (supplier_id, status, notes)
  values (p_supplier_id, 'brouillon', 'Achat lié à l''alerte ' || v_alert.number)
  returning id into v_po_id;

  insert into public.purchase_order_lines (po_id, description, quantity, unit_cost, tax_rate)
  values (v_po_id, v_alert.title, 1, coalesce(p_purchase_price, 0), 0);

  if coalesce(p_delivery_cost, 0) > 0 then
    insert into public.purchase_order_lines (po_id, description, quantity, unit_cost, tax_rate)
    values (v_po_id, 'Livraison', 1, p_delivery_cost, 0);
  end if;

  update public.purchase_orders set status = 'envoyee' where id = v_po_id;

  if v_total > 0 then
    select id into v_acc_achat from public.chart_of_accounts where code = '607';
    select id into v_acc_caisse from public.chart_of_accounts where code = '530';

    if v_acc_achat is not null and v_acc_caisse is not null then
      insert into public.journal_entries (entry_date, reference, description, source_type, source_id, created_by)
      values (current_date, v_alert.number, 'Achat — ' || v_alert.title, 'supply_alert', v_alert.id, v_uid)
      returning id into v_entry_id;

      insert into public.journal_lines (entry_id, account_id, debit, credit, label) values
        (v_entry_id, v_acc_achat, v_total, 0, 'Achat — ' || v_alert.title),
        (v_entry_id, v_acc_caisse, 0, v_total, 'Sortie caisse — ' || v_alert.number);
    end if;
  end if;

  update public.supply_alerts
    set status = 'commandee',
        purchase_price = p_purchase_price,
        delivery_cost = p_delivery_cost,
        purchase_order_id = v_po_id
    where id = p_alert_id;

  return v_po_id;
end;
$$;

-- "Terminer l'alerte" (réception) : marque la commande fournisseur liée comme
-- reçue (déclenche l'entrée de stock pour les lignes reliées à un produit) et
-- résout l'alerte. SECURITY DEFINER pour la même raison que ci-dessus.
create or replace function public.supply_alert_complete(p_alert_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_alert public.supply_alerts%rowtype;
begin
  if not public.is_active_user() or public.current_role() = 'readonly' then
    raise exception 'Non autorisé';
  end if;

  select * into v_alert from public.supply_alerts where id = p_alert_id;
  if v_alert.id is null then
    raise exception 'Alerte introuvable';
  end if;

  if v_alert.purchase_order_id is not null then
    update public.purchase_orders set status = 'recue' where id = v_alert.purchase_order_id and status <> 'recue';
  end if;

  update public.supply_alerts
    set status = 'resolue', resolved_at = now()
    where id = p_alert_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Alertes automatiques
-- ----------------------------------------------------------------------------

-- Commande en file depuis 2 jours ou plus (statut pas encore "prete" ni
-- "livree"). Idempotent — une seule alerte ouverte par commande. Appelée à la
-- volée (page Alertes / tableau de bord) plutôt que par cron.
create or replace function public.sync_stale_order_alerts()
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.supply_alerts (alert_type, department, title, description, priority, status, pipeline_order_id)
  select
    'retard_commande',
    coalesce(po.technique, 'gros'),
    'Commande ' || po.number || ' en retard',
    'En file depuis plus de 2 jours (statut actuel : ' || po.status || ').',
    'high',
    'ouverte',
    po.id
  from public.pipeline_orders po
  where po.status not in ('prete', 'livree')
    and po.created_at < now() - interval '2 days'
    and not exists (
      select 1 from public.supply_alerts sa
      where sa.pipeline_order_id = po.id
        and sa.alert_type = 'retard_commande'
        and sa.status <> 'resolue'
    );
end;
$$;

-- Tentative de livraison Yalidine échouée. Idempotent — une seule alerte
-- ouverte par expédition.
create or replace function public.alert_on_yalidine_failure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'failed' and old.status is distinct from 'failed' then
    if not exists (
      select 1 from public.supply_alerts sa
      where sa.pipeline_order_id = new.order_id
        and sa.alert_type = 'yalidine_echec'
        and sa.status <> 'resolue'
    ) then
      insert into public.supply_alerts (alert_type, department, title, description, priority, status, pipeline_order_id)
      values (
        'yalidine_echec',
        'livraison',
        'Échec de livraison Yalidine',
        coalesce('Motif : ' || new.failure_reason, 'Tentative de livraison échouée') ||
          coalesce(' (colis ' || new.yalidine_tracking_id || ')', ''),
        'urgent',
        'ouverte',
        new.order_id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists alert_on_yalidine_failure_trigger on public.yalidine_shipments;
create trigger alert_on_yalidine_failure_trigger
  after insert or update on public.yalidine_shipments
  for each row execute function public.alert_on_yalidine_failure();

-- ----------------------------------------------------------------------------
-- Vue utilisée par le module Alertes (app/(app)/alerts, tableau de bord).
-- Elle n'était créée par AUCUNE migration : elle n'existait que dans la base
-- de production, ajoutée hors migration, si bien que la migration 0021 (qui
-- la repasse en security_invoker) échouait sur une base reconstruite et que
-- les pages Alertes seraient restées vides sur une nouvelle installation.
-- ----------------------------------------------------------------------------
create or replace view public.supply_alerts_view as
select
  sa.*,
  po.number as pipeline_order_number,
  st.name   as supply_type_name
from public.supply_alerts sa
  left join public.pipeline_orders po on po.id = sa.pipeline_order_id
  left join public.supply_types st on st.id = sa.supply_type_id;
