-- Caractère ERP v2 — fonctions de base : identité, droits, numérotation, clients, ventes
-- Convention : les fonctions "API" sont SECURITY DEFINER et vérifient les droits (erp.need).
-- Les fonctions internes sont SECURITY INVOKER : appelées directement par un utilisateur,
-- elles échouent faute de droits sur les tables.

create or replace function erp.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function erp.is_system() returns boolean language sql stable as $$
  select erp.uid() is null and coalesce(current_setting('erp.system', true), '') = 'on'
$$;

create or replace function erp.me() returns uuid language sql stable security definer set search_path = erp, pg_temp as $$
  select id from erp.staff where auth_user_id = erp.uid() and active
$$;

create or replace function erp.my_roles() returns text[] language sql stable security definer set search_path = erp, pg_temp as $$
  select coalesce((select roles from erp.staff where auth_user_id = erp.uid() and active), '{}')
$$;

-- Matrice des droits (dupliquée côté interface dans lib/perms.ts pour l'affichage uniquement)
create or replace function erp.role_can(roles text[], cap text) returns boolean language sql immutable as $$
  select 'gerant' = any(roles) or case cap
    when 'clients_view'     then roles && array['commercial','caissier']
    when 'clients_edit'     then roles && array['commercial']
    when 'sales'            then roles && array['commercial']
    when 'orders_view'      then cardinality(roles) > 0
    when 'orders_edit'      then roles && array['commercial']
    when 'money_view'       then roles && array['commercial','caissier']
    when 'payment_record'   then roles && array['commercial','caissier']
    when 'workshop_view'    then roles && array['infographiste','floqueur','brodeur','controleur','commercial','magasinier']
    when 'workshop_work'    then roles && array['infographiste','floqueur','brodeur','controleur','magasinier']
    when 'priority'         then roles && array['commercial']
    when 'stock_view'       then cardinality(roles) > 0
    when 'stock_edit'       then roles && array['magasinier']
    when 'purchase_request' then roles && array['magasinier','commercial']
    when 'cash'             then roles && array['caissier']
    when 'remittance'       then roles && array['caissier']
    when 'shipping'         then roles && array['commercial','magasinier']
    else false  -- cost_view, cash_correct, purchase_approve, settings, waive_deposit : gérant seul
  end
$$;

create or replace function erp.can(cap text) returns boolean language sql stable security definer set search_path = erp, pg_temp as $$
  select erp.is_system() or erp.role_can(erp.my_roles(), cap)
$$;

create or replace function erp.need(cap text) returns uuid language plpgsql stable security definer set search_path = erp, pg_temp as $$
begin
  if not erp.can(cap) then
    raise exception 'Accès refusé (%).', cap using errcode = '42501';
  end if;
  return erp.me();
end $$;

create or replace function erp.today() returns date language sql stable as $$
  select (now() at time zone 'Africa/Algiers')::date
$$;

create or replace function erp.setting(k text) returns jsonb language sql stable security definer set search_path = erp, pg_temp as $$
  select value from erp.settings where key = k
$$;
create or replace function erp.setting_num(k text, dflt numeric) returns numeric language sql stable security definer set search_path = erp, pg_temp as $$
  select coalesce((select (value #>> '{}')::numeric from erp.settings where key = k), dflt)
$$;
create or replace function erp.setting_text(k text, dflt text) returns text language sql stable security definer set search_path = erp, pg_temp as $$
  select coalesce((select value #>> '{}' from erp.settings where key = k), dflt)
$$;

create or replace function erp.next_counter(k text) returns integer language sql as $$
  insert into erp.counters(key, value) values (k, 1)
  on conflict (key) do update set value = erp.counters.value + 1
  returning value
$$;

create or replace function erp.new_ref() returns text language plpgsql as $$
declare yy text := to_char(erp.today(), 'YY'); n int;
begin
  n := erp.next_counter('ref-' || yy);
  return erp.setting_text('ref_prefix', 'CAR') || '-' || yy || '-' || lpad(n::text, 4, '0');
end $$;

-- Téléphones algériens : +213, 00213, 0, espaces, tirets → +213XXXXXXXXX
create or replace function erp.normalize_phone(p text) returns text language plpgsql immutable as $$
declare d text; plus boolean;
begin
  if p is null or btrim(p) = '' then return null; end if;
  plus := btrim(p) like '+%';
  d := regexp_replace(p, '\D', '', 'g');
  if d like '00%' then d := substr(d, 3); plus := true; end if;
  if d like '213%' and length(d) in (11, 12) then return '+' || d; end if;
  if d like '0%' and length(d) in (9, 10) then return '+213' || substr(d, 2); end if;
  if not plus and length(d) in (8, 9) then return '+213' || d; end if;
  if plus and length(d) between 8 and 15 then return '+' || d; end if;
  return null;
end $$;

create or replace function erp.log_order(o uuid, k text, b jsonb, a jsonb, n text) returns void language sql as $$
  insert into erp.order_events(order_id, staff_id, kind, before, after, note) values (o, erp.me(), k, b, a, n)
$$;

create or replace function erp.least_loaded(role_name text) returns uuid language sql stable as $$
  select s.id from erp.staff s
  where s.active and role_name = any(s.roles)
  order by (select count(*) from erp.tasks t where t.assignee_id = s.id and t.status in ('a_faire','en_cours','bloquee')), s.created_at
  limit 1
$$;

-- ============================ CLIENTS ============================
create or replace function erp.find_duplicates(p_name text, p_phone text, p_exclude uuid default null)
returns table(id uuid, name text, phone text, match text)
language sql stable security definer set search_path = erp, pg_temp as $$
  select c.id, c.name, c.phone,
         case when c.phone = erp.normalize_phone(p_phone) then 'telephone' else 'nom' end
  from erp.clients c
  where erp.can('clients_view')
    and (p_exclude is null or c.id <> p_exclude)
    and ((erp.normalize_phone(p_phone) is not null and c.phone = erp.normalize_phone(p_phone))
      or (coalesce(btrim(p_name), '') <> '' and lower(btrim(c.name)) = lower(btrim(p_name))))
  order by 4 desc
  limit 10
$$;

create or replace function erp.create_client(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('clients_edit'); v_phone text; v_id uuid; v_owner uuid; dup record;
begin
  if coalesce(btrim(p->>'name'), '') = '' then raise exception 'Le nom est obligatoire.'; end if;
  v_phone := erp.normalize_phone(p->>'phone');
  if coalesce(btrim(p->>'phone'), '') <> '' and v_phone is null then
    raise exception 'Numéro de téléphone invalide : %', p->>'phone';
  end if;
  select c.id, c.name into dup from erp.clients c where c.phone = v_phone;
  if found then raise exception 'DOUBLON: ce numéro appartient déjà à % (%)', dup.name, dup.id; end if;
  v_owner := coalesce(nullif(p->>'owner_id','')::uuid, me);
  insert into erp.clients(kind, name, company, phone, phone_raw, email, wilaya, commune, address, source, owner_id,
                          contact_pref, marketing_opt_out, opt_out_reason, notes, created_by)
  values (coalesce(nullif(p->>'kind',''), 'prospect'), btrim(p->>'name'), nullif(p->>'company',''), v_phone, nullif(p->>'phone',''),
          nullif(p->>'email',''), nullif(p->>'wilaya',''), nullif(p->>'commune',''), nullif(p->>'address',''),
          coalesce(nullif(p->>'source',''), 'autre'), v_owner, coalesce(nullif(p->>'contact_pref',''), 'whatsapp'),
          coalesce((p->>'marketing_opt_out')::boolean, false), nullif(p->>'opt_out_reason',''), nullif(p->>'notes',''), me)
  returning id into v_id;
  insert into erp.interactions(client_id, staff_id, kind, summary)
  values (v_id, me, 'note', 'Fiche créée (source : ' || coalesce(nullif(p->>'source',''), 'autre') || ')');
  if coalesce(nullif(p->>'kind',''), 'prospect') = 'prospect' and coalesce((p->>'skip_followup')::boolean, false) = false then
    insert into erp.followups(client_id, owner_id, due_date, reason, note)
    values (v_id, v_owner, erp.today(), 'nouveau_prospect', 'Premier contact du nouveau prospect');
  end if;
  return v_id;
end $$;

create or replace function erp.update_client(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('clients_edit'); v_phone text; dup record;
begin
  v_phone := erp.normalize_phone(p->>'phone');
  if coalesce(btrim(p->>'phone'), '') <> '' and v_phone is null then
    raise exception 'Numéro de téléphone invalide : %', p->>'phone';
  end if;
  select c.id, c.name into dup from erp.clients c where c.phone = v_phone and c.id <> p_id;
  if found then raise exception 'DOUBLON: ce numéro appartient déjà à %', dup.name; end if;
  update erp.clients set
    name = coalesce(nullif(btrim(p->>'name'),''), name), company = nullif(p->>'company',''),
    phone = v_phone, phone_raw = nullif(p->>'phone',''), email = nullif(p->>'email',''),
    wilaya = nullif(p->>'wilaya',''), commune = nullif(p->>'commune',''), address = nullif(p->>'address',''),
    source = coalesce(nullif(p->>'source',''), source), owner_id = coalesce(nullif(p->>'owner_id','')::uuid, owner_id),
    contact_pref = coalesce(nullif(p->>'contact_pref',''), contact_pref),
    marketing_opt_out = coalesce((p->>'marketing_opt_out')::boolean, marketing_opt_out),
    opt_out_reason = case when coalesce((p->>'marketing_opt_out')::boolean, marketing_opt_out) then coalesce(nullif(p->>'opt_out_reason',''), opt_out_reason) else null end,
    notes = nullif(p->>'notes',''), updated_at = now()
  where id = p_id;
  if not found then raise exception 'Client introuvable.'; end if;
  -- un refus marketing annule les relances marketing ouvertes
  update erp.followups f set status = 'annule', result = 'Refus des relances marketing', done_at = now(), done_by = me
  from erp.clients c where c.id = p_id and c.marketing_opt_out and f.client_id = p_id and f.is_marketing and f.status = 'a_faire';
end $$;

create or replace function erp.log_interaction(p_client uuid, p_kind text, p_summary text) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('clients_edit'); v uuid;
begin
  insert into erp.interactions(client_id, staff_id, kind, summary) values (p_client, me, p_kind, p_summary) returning id into v;
  return v;
end $$;

create or replace function erp.create_followup(p_client uuid, p_reason text, p_due date, p_note text, p_owner uuid default null, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('clients_edit'); v uuid; c record;
begin
  select * into c from erp.clients where id = p_client;
  if p_reason = 'reactivation' and c.marketing_opt_out then
    raise exception 'Ce client refuse les relances marketing.';
  end if;
  insert into erp.followups(client_id, order_id, owner_id, due_date, reason, is_marketing, note)
  values (p_client, p_order, coalesce(p_owner, c.owner_id, me), coalesce(p_due, erp.today()), p_reason, p_reason = 'reactivation', p_note)
  on conflict do nothing returning id into v;
  return v;
end $$;

-- Clôture une relance : résultat obligatoire, éventuellement reprogrammée
create or replace function erp.complete_followup(p_id uuid, p_result text, p_next date default null, p_channel text default 'whatsapp')
returns void language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('clients_edit'); f record;
begin
  if coalesce(btrim(p_result), '') = '' then raise exception 'Indiquez le résultat de la relance.'; end if;
  select * into f from erp.followups where id = p_id for update;
  if not found then raise exception 'Relance introuvable.'; end if;
  if f.status <> 'a_faire' then return; end if;
  update erp.followups set status = 'fait', result = p_result, done_by = me, done_at = now() where id = p_id;
  insert into erp.interactions(client_id, staff_id, kind, summary, order_id, quote_id)
  values (f.client_id, me, case when p_channel in ('appel','whatsapp','sms','visite','email') then p_channel else 'relance' end,
          'Relance (' || f.reason || ') : ' || p_result, f.order_id, f.quote_id);
  if p_next is not null then
    insert into erp.followups(client_id, order_id, quote_id, shipment_id, owner_id, due_date, reason, is_marketing, note)
    values (f.client_id, f.order_id, f.quote_id, f.shipment_id, f.owner_id, p_next, f.reason, f.is_marketing, 'Reprogrammée : ' || p_result);
  end if;
end $$;

-- Génère les relances "devis sans réponse" et "réactivation" (idempotent)
create or replace function erp.refresh_followups() returns integer
language plpgsql security definer set search_path = erp, pg_temp as $$
declare n int := 0; k int; days int := erp.setting_num('quote_followup_days', 3)::int; react int := erp.setting_num('reactivation_days', 90)::int;
begin
  if not erp.can('clients_view') then return 0; end if;
  insert into erp.followups(client_id, quote_id, owner_id, due_date, reason, note)
  select q.client_id, q.id, q.owner_id, erp.today(), 'devis_sans_reponse', 'Devis ' || q.ref || ' envoyé le ' || to_char(q.sent_at at time zone 'Africa/Algiers', 'DD/MM')
  from erp.quotes q
  where q.status = 'envoye' and (q.sent_at at time zone 'Africa/Algiers')::date <= erp.today() - days
    and not exists (select 1 from erp.followups f where f.quote_id = q.id and (f.status = 'a_faire' or f.due_date > erp.today() - days))
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;
  insert into erp.followups(client_id, owner_id, due_date, reason, is_marketing, note)
  select c.id, c.owner_id, erp.today(), 'reactivation', true, 'Dernière livraison le ' || to_char(max(o.delivered_at) at time zone 'Africa/Algiers', 'DD/MM/YYYY')
  from erp.clients c join erp.orders o on o.client_id = c.id and o.status in ('livree','retiree')
  where not c.marketing_opt_out
    and not exists (select 1 from erp.orders o2 where o2.client_id = c.id and o2.status not in ('livree','retiree','annulee','retournee'))
    and not exists (select 1 from erp.followups f where f.client_id = c.id and f.reason = 'reactivation' and (f.status = 'a_faire' or f.created_at > now() - make_interval(days => react)))
  group by c.id, c.owner_id
  having max(o.delivered_at) < now() - make_interval(days => react)
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- ============================ VENTES ============================
create or replace function erp.create_deal(p_client uuid, p_title text, p_owner uuid, p_next text, p_next_date date, p_estimate numeric default null)
returns uuid language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales'); v uuid;
begin
  insert into erp.deals(client_id, title, owner_id, next_action, next_action_date, estimate)
  values (p_client, coalesce(nullif(btrim(p_title),''), 'Nouvelle affaire'), coalesce(p_owner, me), p_next, coalesce(p_next_date, erp.today()), p_estimate)
  returning id into v;
  return v;
end $$;

create or replace function erp.move_deal(p_id uuid, p_stage text, p_lost_reason text default null, p_next text default null, p_next_date date default null)
returns void language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales');
begin
  if p_stage = 'perdu' and coalesce(btrim(p_lost_reason),'') = '' then raise exception 'Indiquez le motif de perte.'; end if;
  update erp.deals set stage = p_stage, lost_reason = case when p_stage = 'perdu' then p_lost_reason end,
    next_action = case when p_stage in ('gagne','perdu') then null else coalesce(p_next, next_action) end,
    next_action_date = case when p_stage in ('gagne','perdu') then null else coalesce(p_next_date, next_action_date) end,
    updated_at = now()
  where id = p_id;
end $$;

create or replace function erp.register_file(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.me(); v uuid;
begin
  if me is null and not erp.is_system() then raise exception 'Accès refusé.'; end if;
  if not (erp.can('clients_edit') or erp.can('orders_edit') or erp.can('workshop_work')) then raise exception 'Accès refusé (fichiers).'; end if;
  insert into erp.files(kind, client_id, order_id, quote_id, deal_id, storage, path, filename, mime, size_bytes, uploaded_by)
  values (p->>'kind', nullif(p->>'client_id','')::uuid, nullif(p->>'order_id','')::uuid, nullif(p->>'quote_id','')::uuid,
          nullif(p->>'deal_id','')::uuid, coalesce(p->>'storage','local'), p->>'path', p->>'filename', p->>'mime', (p->>'size_bytes')::int, me)
  returning id into v;
  return v;
end $$;

create or replace function erp.add_simulation(p jsonb) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('sales'); v uuid; v_deal uuid := nullif(p->>'deal_id','')::uuid;
begin
  insert into erp.simulations(client_id, deal_id, logo_file_id, mockup_file_id, garment, placement, notes, sent_at, created_by)
  values ((p->>'client_id')::uuid, v_deal, nullif(p->>'logo_file_id','')::uuid, nullif(p->>'mockup_file_id','')::uuid,
          nullif(p->>'garment',''), nullif(p->>'placement',''), nullif(p->>'notes',''),
          case when coalesce((p->>'sent')::boolean, true) then now() end, me)
  returning id into v;
  insert into erp.interactions(client_id, staff_id, kind, summary)
  values ((p->>'client_id')::uuid, me, 'simulation', 'Simulation du logo' || coalesce(' — ' || nullif(p->>'garment',''), '') || coalesce(' (' || nullif(p->>'placement','') || ')', ''));
  if v_deal is not null then
    update erp.deals set stage = 'simulation_envoyee', updated_at = now(),
      next_action = 'Relancer sur la simulation et proposer le devis', next_action_date = erp.today() + 1
    where id = v_deal and stage in ('nouveau','a_qualifier');
  end if;
  return v;
end $$;
