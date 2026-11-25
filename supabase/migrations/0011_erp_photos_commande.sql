-- Photos de commande (maquettes, photos) et boutons « Commencer / Terminer la commande ».
-- Les photos sont stockées dans la base (table erp.file_blobs) : aucune configuration de stockage externe nécessaire.

alter table erp.files drop constraint if exists files_storage_check;
alter table erp.files add constraint files_storage_check check (storage in ('local','supabase','db'));

create table if not exists erp.file_blobs (
  file_id uuid primary key references erp.files(id) on delete cascade,
  data bytea not null
);
alter table erp.file_blobs enable row level security;
revoke all on erp.file_blobs from public, anon, authenticated;

-- Ajoute une photo à une commande (image déjà réduite côté navigateur, envoyée en base64)
create or replace function erp.add_order_photo(p_order uuid, p_filename text, p_mime text, p_data text) returns uuid
language plpgsql security definer set search_path = erp, pg_temp as $$
declare me uuid := erp.me(); v uuid; bytes bytea;
begin
  if me is null then raise exception 'Accès refusé.'; end if;
  if not (erp.can('orders_edit') or erp.can('workshop_work')) then raise exception 'Accès refusé (photos).'; end if;
  if not exists (select 1 from erp.orders where id = p_order) then raise exception 'Commande introuvable.'; end if;
  if coalesce(p_mime, '') !~ '^image/(jpeg|png|webp)$' then raise exception 'Seules les images (JPEG, PNG, WebP) sont acceptées.'; end if;
  bytes := decode(p_data, 'base64');
  if length(bytes) > 3 * 1024 * 1024 then raise exception 'Image trop lourde (3 Mo maximum).'; end if;
  if (select count(*) from erp.files where order_id = p_order and kind = 'photo') >= 12 then raise exception '12 photos maximum par commande.'; end if;
  insert into erp.files(kind, order_id, client_id, storage, path, filename, mime, size_bytes, uploaded_by)
  select 'photo', p_order, o.client_id, 'db', 'db', coalesce(nullif(btrim(p_filename), ''), 'photo.jpg'), p_mime, length(bytes), me from erp.orders o where o.id = p_order
  returning id into v;
  insert into erp.file_blobs(file_id, data) values (v, bytes);
  perform erp.log_order(p_order, 'photo', null, jsonb_build_object('file', v), 'Photo ajoutée');
  return v;
end $$;

create or replace function erp.remove_order_photo(p_file uuid) returns void
language plpgsql security definer set search_path = erp, pg_temp as $$
declare f record;
begin
  perform erp.need('orders_edit');
  select * into f from erp.files where id = p_file and kind = 'photo' and order_id is not null;
  if not found then raise exception 'Photo introuvable.'; end if;
  delete from erp.files where id = p_file;
  perform erp.log_order(f.order_id, 'photo', jsonb_build_object('file', p_file), null, 'Photo retirée');
end $$;

-- Contenu d'un fichier stocké en base, seulement s'il est visible pour l'utilisateur (mêmes règles que erp.v_files)
create or replace function erp.file_data(p_id uuid) returns bytea
language sql stable security definer set search_path = erp, pg_temp as $$
  select b.data from erp.file_blobs b join erp.files f on f.id = b.file_id
  where b.file_id = p_id and ((f.order_id is not null and erp.can('orders_view')) or erp.can('clients_view') or erp.can('sales'))
$$;

-- Circuit simple : plus de validation de première pièce bloquante (Commencer → en cours, Terminer → prête)
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
    values (l.order_id, p_line, st, i, v_station, v_assignee, v_machine, q, false)
    on conflict (line_id, step) do nothing;
  end loop;
end $$;

update erp.tasks set needs_first_piece = false where status = 'a_faire' and started_at is null;

-- Commencer toute la commande : démarre la première étape de chaque article
create or replace function erp.start_order(p_order uuid) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare o record; t record; n int := 0;
begin
  perform erp.need('workshop_work');
  select * into o from erp.orders where id = p_order;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status = 'brouillon' then raise exception 'Confirmez d''abord la commande.'; end if;
  if o.status not in ('confirmee','en_production') then raise exception 'Commande déjà %.', o.status; end if;
  for t in select x.* from erp.tasks x where x.order_id = p_order and x.status = 'a_faire'
           and not exists (select 1 from erp.tasks p where p.line_id = x.line_id and p.seq < x.seq and p.status not in ('terminee','annulee'))
           order by x.line_id, x.seq loop
    perform erp.start_task(t.id);
    n := n + 1;
  end loop;
  if n = 0 and not exists (select 1 from erp.tasks where order_id = p_order and status = 'en_cours') then
    raise exception 'Aucune tâche à démarrer (vérifiez les tâches bloquées).';
  end if;
  return (select status from erp.orders where id = p_order);
end $$;

-- Terminer toute la commande : termine toutes les étapes dans l'ordre, la commande passe « Prête »
create or replace function erp.finish_order(p_order uuid) returns text
language plpgsql security definer set search_path = erp, pg_temp as $$
declare o record; t record; guard int := 0;
begin
  perform erp.need('workshop_work');
  select * into o from erp.orders where id = p_order;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status = 'brouillon' then raise exception 'Confirmez d''abord la commande.'; end if;
  if o.status not in ('confirmee','en_production') then raise exception 'Commande déjà %.', o.status; end if;
  if exists (select 1 from erp.tasks where order_id = p_order and status = 'bloquee') then
    raise exception 'Une tâche est bloquée : débloquez-la avant de terminer la commande.';
  end if;
  loop
    guard := guard + 1;
    exit when guard > 100;
    select x.* into t from erp.tasks x where x.order_id = p_order and x.status in ('a_faire','en_cours')
      and not exists (select 1 from erp.tasks p where p.line_id = x.line_id and p.seq < x.seq and p.status not in ('terminee','annulee'))
      order by x.line_id, x.seq limit 1;
    exit when not found;
    if t.status = 'a_faire' then perform erp.start_task(t.id); end if;
    if t.needs_first_piece then
      update erp.tasks set first_piece_status = 'validee', first_piece_by = erp.me(), first_piece_at = now() where id = t.id and first_piece_status <> 'validee';
    end if;
    perform erp.finish_task(t.id);
  end loop;
  return (select status from erp.orders where id = p_order);
end $$;

revoke all on function erp.add_order_photo(uuid, text, text, text), erp.remove_order_photo(uuid), erp.file_data(uuid), erp.start_order(uuid), erp.finish_order(uuid) from public, anon;
grant execute on function erp.add_order_photo(uuid, text, text, text), erp.remove_order_photo(uuid), erp.file_data(uuid), erp.start_order(uuid), erp.finish_order(uuid) to authenticated;
