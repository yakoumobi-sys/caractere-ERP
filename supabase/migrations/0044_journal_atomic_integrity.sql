-- New migration in the repository's sequential numbering; created using Supabase CLI.
-- A balanced pair could previously be appended to a posted journal.
create or replace function public.guard_generated_journal()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_source text; v_xmin text;
begin
  if tg_table_name='journal_entries' then
    if coalesce(old.source_type,'')<>'' then
      raise exception 'Écriture générée : passez par une contre-écriture';
    end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE','DELETE') then
    select source_type into v_source from public.journal_entries where id=old.entry_id;
    if coalesce(v_source,'')<>'' then raise exception 'Ligne générée : passez par une contre-écriture'; end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select source_type,xmin::text into v_source,v_xmin from public.journal_entries where id=new.entry_id;
    -- Generated journals are built atomically. No later transaction may append
    -- even balanced lines, nor move manual lines into a generated entry.
    if coalesce(v_source,'')<>'' and
      (tg_op='UPDATE' or v_xmin::bigint<>(txid_current()%4294967296)) then
      raise exception 'Écriture générée : ajout interdit, passez par une contre-écriture';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger guard_generated_journal_lines on public.journal_lines;
create trigger guard_generated_journal_lines before insert or update or delete on public.journal_lines
  for each row execute function public.guard_generated_journal();

-- Moving a manual line must leave BOTH its former and new entry balanced.
create or replace function public.check_journal_balance()
returns trigger language plpgsql as $$
declare v_id uuid; v_diff numeric;
begin
  for v_id in select distinct id from unnest(array[
    case when tg_op<>'INSERT' then old.entry_id end,
    case when tg_op<>'DELETE' then new.entry_id end]) id where id is not null loop
    select coalesce(sum(debit-credit),0) into v_diff from public.journal_lines where entry_id=v_id;
    if v_diff<>0 then raise exception 'Écriture déséquilibrée (débit - crédit = %)',v_diff; end if;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;

-- Header + all lines are one transaction; a bad line leaves no orphan header.
create or replace function public.save_manual_journal(p_date date,p_reference text,p_description text,p_lines jsonb,p_request_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid; v_line jsonb; v_debit numeric; v_credit numeric; v_total numeric:=0; v_payload jsonb;
begin
  if not coalesce(public.is_active_user(),false) or public.current_role() not in ('admin','accounting') then raise exception 'Accès réservé à la comptabilité'; end if;
  if p_request_id is null or p_date is null or p_date>(now() at time zone 'Africa/Algiers')::date then raise exception 'Date ou identifiant invalide'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Lignes invalides'; end if;
  if jsonb_array_length(p_lines)<2 or jsonb_array_length(p_lines)>500 then raise exception 'Deux à 500 lignes requises'; end if;
  if length(coalesce(p_reference,''))>500 or length(coalesce(p_description,''))>2000 then raise exception 'Texte trop long'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  v_payload:=jsonb_build_object('date',p_date,'reference',p_reference,'description',p_description,'lines',p_lines);
  select id into v_id from public.journal_entries where source_type='manual' and source_id=p_request_id;
  if found then
    if (select manual_payload from public.journal_entries where id=v_id) is distinct from v_payload then raise exception 'Identifiant déjà utilisé pour une autre écriture'; end if;
    return v_id;
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_debit:=(v_line->>'debit')::numeric; v_credit:=(v_line->>'credit')::numeric;
    if v_debit is null or v_credit is null or v_debit::text in ('NaN','Infinity','-Infinity') or v_credit::text in ('NaN','Infinity','-Infinity') or v_debit<0 or v_credit<0 or round(v_debit,2)<>v_debit or round(v_credit,2)<>v_credit or (v_debit>0)=(v_credit>0) then raise exception 'Débit ou crédit invalide'; end if;
    if not exists(select 1 from public.chart_of_accounts where id=(v_line->>'account_id')::uuid and is_active) then raise exception 'Compte inexistant ou inactif'; end if;
    if length(coalesce(v_line->>'label',''))>2000 then raise exception 'Libellé trop long'; end if;
    v_total:=v_total+v_debit-v_credit;
  end loop;
  if v_total<>0 then raise exception 'Écriture déséquilibrée'; end if;
  insert into public.journal_entries(entry_date,reference,description,source_type,source_id,created_by,manual_payload)
    values(p_date,p_reference,p_description,'manual',p_request_id,auth.uid(),v_payload) returning id into v_id;
  insert into public.journal_lines(entry_id,account_id,debit,credit,label)
    select v_id,(value->>'account_id')::uuid,(value->>'debit')::numeric,(value->>'credit')::numeric,value->>'label' from jsonb_array_elements(p_lines);
  return v_id;
end $$;
alter table public.journal_entries add column manual_payload jsonb;
revoke all on function public.save_manual_journal(date,text,text,jsonb,uuid) from public,anon;
grant execute on function public.save_manual_journal(date,text,text,jsonb,uuid) to authenticated;

-- A client balance is derived from orders and invoices, never freely editable.
create or replace function public.guard_contact_balance()
returns trigger language plpgsql set search_path=public as $$
begin
  if pg_trigger_depth()=1 and ((tg_op='INSERT' and coalesce(new.balance,0)<>0)
    or (tg_op='UPDATE' and new.balance is distinct from old.balance)) then
    raise exception 'Solde client calculé automatiquement : enregistrez une opération liée';
  end if;
  return new;
end $$;
create trigger guard_contact_balance before insert or update on public.contacts
  for each row execute function public.guard_contact_balance();
revoke all on function public.guard_contact_balance() from public,anon,authenticated;
