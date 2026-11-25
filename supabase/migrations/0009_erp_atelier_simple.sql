-- Circuit atelier simplifié (demande du gérant) :
-- chaque commande part dans la file DTF ou dans la file Flocage (broderie si besoin), puis passe « Prête ».
-- Plus d'étapes séparées préparation du fichier / contrôle / emballage. La validation de la première pièce reste sur le flocage et la broderie.
-- Les tâches déjà créées ne sont pas modifiées : seules les nouvelles confirmations suivent ce circuit.

create or replace function erp.create_tasks(p_line uuid) returns void language plpgsql as $$
declare l record; steps text[]; st text; i int := 0; v_station text; v_assignee uuid; v_machine uuid; q int;
begin
  select * into l from erp.lines where id = p_line;
  q := erp.line_qty(l.sizes);
  -- Circuit de l'atelier : une seule file par ligne (DTF, sinon flocage, sinon broderie), puis commande prête
  if 'dtf' = any(l.services) then steps := array['impression_dtf'];
  elsif 'flocage' = any(l.services) then steps := array['flocage'];
  elsif 'broderie' = any(l.services) then steps := array['broderie'];
  else steps := array['preparation']; end if;
  foreach st in array steps loop
    i := i + 1;
    v_station := case st when 'preparation_fichier' then 'infographie' when 'impression_dtf' then 'dtf' when 'flocage' then 'presse'
      when 'broderie' then 'broderie' when 'preparation' then 'magasin' when 'controle' then 'controle' else 'emballage' end;
    v_assignee := case st when 'preparation_fichier' then erp.least_loaded('infographiste') when 'impression_dtf' then erp.least_loaded('infographiste')
      when 'flocage' then erp.least_loaded('floqueur') when 'broderie' then erp.least_loaded('brodeur')
      when 'preparation' then erp.least_loaded('magasinier') when 'controle' then erp.least_loaded('controleur') else null end;
    v_machine := case st
      when 'impression_dtf' then (select id from erp.machines where kind = 'dtf' and active and (l.print_width_cm is null or laize_cm >= l.print_width_cm) order by laize_cm limit 1)
      when 'flocage' then (select id from erp.machines where kind = 'presse' and active order by name limit 1)
      when 'broderie' then (select id from erp.machines where kind = 'brodeuse' and active order by name limit 1) end;
    insert into erp.tasks(order_id, line_id, step, seq, station, assignee_id, machine_id, qty_target, needs_first_piece)
    values (l.order_id, p_line, st, i, v_station, v_assignee, v_machine, q, st in ('flocage','broderie'))
    on conflict (line_id, step) do nothing;
  end loop;
end $$;

create or replace function erp.start_task(p_id uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); t erp.tasks; miss jsonb; o record;
begin
  select * into t from erp.tasks where id = p_id for update;
  if not found then raise exception 'Tâche introuvable.'; end if;
  if t.status = 'en_cours' then return; end if;
  if t.status in ('terminee','annulee') then raise exception 'Tâche déjà %.', t.status; end if;
  if t.status = 'bloquee' then raise exception 'Tâche bloquée (%) : débloquez-la d''abord.', t.blocked_reason; end if;
  select * into o from erp.orders where id = t.order_id for update;
  if o.blocked_reason is not null then raise exception 'Commande bloquée : %.', o.blocked_reason; end if;
  perform erp._task_guard(t);
  if t.step in ('impression_dtf','flocage','broderie','preparation') then
    miss := erp.line_missing(t.line_id);
    if miss <> '{}'::jsonb then raise exception 'Rupture de stock, mise en production bloquée. Manque : %', miss::text; end if;
  end if;
  if t.step in ('impression_dtf','flocage','broderie','preparation') then perform erp.consume_line_stock(t.line_id, 'sortie_atelier'); end if;
  update erp.tasks set status = 'en_cours', started_by = me, started_at = now(), assignee_id = coalesce(assignee_id, me),
    first_piece_status = case when needs_first_piece and first_piece_status <> 'validee' then 'a_valider' else first_piece_status end
  where id = p_id;
  insert into erp.task_log(task_id, staff_id, action) values (p_id, me, 'demarrer');
  if o.status = 'confirmee' then
    update erp.orders set status = 'en_production', updated_at = now() where id = o.id;
    perform erp.log_order(o.id, 'statut', jsonb_build_object('status','confirmee'), jsonb_build_object('status','en_production'), 'Première tâche démarrée');
  end if;
end $$;

create or replace function erp.finish_task(p_id uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.need('workshop_work'); t erp.tasks; flocker uuid; o record;
begin
  select * into t from erp.tasks where id = p_id for update;
  if t.status = 'terminee' then return; end if;
  if t.status <> 'en_cours' then raise exception 'Démarrez la tâche avant de la terminer.'; end if;
  if t.needs_first_piece and t.first_piece_status <> 'validee' then
    raise exception 'Première pièce non validée : la série ne peut pas être lancée ni terminée.';
  end if;
  if t.step = 'controle' then
    select finished_by into flocker from erp.tasks where line_id = t.line_id and step = 'flocage';
    if flocker is not null and flocker = me then
      raise exception 'Contrôle croisé : le contrôle doit être fait par un autre membre que le floqueur.';
    end if;
  end if;
  select * into o from erp.orders where id = t.order_id for update;
  update erp.tasks set status = 'terminee', qty_done = qty_target, rework_pending = 0, finished_by = me, finished_at = now() where id = p_id;
  insert into erp.task_log(task_id, staff_id, action) values (p_id, me, 'terminer');
  if t.step = 'emballage' or not exists (select 1 from erp.tasks where line_id = t.line_id and id <> t.id and status not in ('terminee','annulee')) then
    update erp.lines set produced = t.qty_target where id = t.line_id;
  end if;
  if o.status in ('confirmee','en_production')
     and not exists (select 1 from erp.tasks where order_id = o.id and status not in ('terminee','annulee')) then
    update erp.orders set status = 'prete', ready_at = now(), updated_at = now() where id = o.id;
    perform erp.log_order(o.id, 'statut', jsonb_build_object('status', o.status), jsonb_build_object('status','prete'), 'Fabrication terminée');
  end if;
end $$;
