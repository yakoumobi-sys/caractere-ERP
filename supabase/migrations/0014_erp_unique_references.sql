-- Le compteur annuel est commun aux commandes et devis.
-- Une référence importée ou saisie hors compteur peut déjà occuper le numéro suivant.
create or replace function erp.new_ref() returns text language plpgsql as $$
declare
  yy text := to_char(erp.today(), 'YY');
  prefix text := erp.setting_text('ref_prefix', 'CAR') || '-' || yy || '-';
  number_text text;
  candidate text;
begin
  loop
    -- La mise à jour du compteur verrouille sa ligne jusqu'à la fin de la transaction.
    number_text := erp.next_counter('ref-' || yy)::text;
    candidate := prefix || lpad(number_text, greatest(4, length(number_text)), '0');
    if not exists (select 1 from erp.orders o where o.ref = candidate)
       and not exists (select 1 from erp.quotes q where q.ref = candidate) then
      return candidate;
    end if;
  end loop;
end $$;
