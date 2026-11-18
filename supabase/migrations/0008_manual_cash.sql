-- Les encaissements de commandes gardent leur paiement et leur reçu.
-- Les apports en espèces ont leur propre type dans le journal.
alter table erp.cash_moves drop constraint cash_moves_kind_check;
alter table erp.cash_moves add constraint cash_moves_kind_check
  check (kind in ('fond','encaissement','depense','remboursement','correction','retrait','entree'));
alter table erp.cash_moves add column request_key text unique;

create function erp.manual_cash_move(p_session uuid, p_kind text, p_amount numeric, p_reason text, p_key text)
returns uuid language plpgsql security definer set search_path = erp, pg_temp as $$
declare
  me uuid := erp.need('cash');
  existing erp.cash_moves%rowtype;
  result uuid;
  signed_amount numeric;
begin
  if p_kind is null or p_kind not in ('entree','depense','retrait') then raise exception 'Choisissez une entrée ou une sortie.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or round(p_amount, 2) <> p_amount then
    raise exception 'Saisissez un montant positif avec deux décimales maximum.';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Indiquez le motif de la transaction.'; end if;
  if nullif(trim(p_key), '') is null then raise exception 'Rouvrez le formulaire de transaction.'; end if;
  signed_amount := case when p_kind = 'entree' then p_amount else -p_amount end;
  perform pg_advisory_xact_lock(hashtextextended(p_key, 1));
  select * into existing from erp.cash_moves where request_key = p_key;
  if found then
    if existing.session_id = p_session and existing.staff_id = me and existing.kind = p_kind
      and existing.amount = signed_amount and existing.label = trim(p_reason) then return existing.id; end if;
    raise exception 'Cette transaction a déjà été enregistrée.';
  end if;
  perform 1 from erp.cash_sessions where id = p_session and closed_at is null for update;
  if not found then raise exception 'La session de caisse est fermée. Ouvrez la caisse avant la saisie.'; end if;
  insert into erp.cash_moves(session_id, kind, amount, label, staff_id, request_key)
    values (p_session, p_kind, signed_amount, trim(p_reason), me, p_key) returning id into result;
  return result;
end $$;
revoke all on function erp.manual_cash_move(uuid,text,numeric,text,text) from public, anon;
grant execute on function erp.manual_cash_move(uuid,text,numeric,text,text) to authenticated;
