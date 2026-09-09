-- ============================================================================
-- Caractère ERP — Les écritures générées sont immuables
--
-- La migration 0039 rend un règlement immuable, mais pas son écriture. Or les
-- policies de 0003 donnent à admin et accounting un droit d'écriture complet
-- (« for all ») sur journal_entries et journal_lines : un UPDATE ou un DELETE
-- direct suffisait à désynchroniser une écriture de son règlement — la facture
-- restait payée, sa contrepartie comptable disparaissait, et rien ne le
-- signalait. C'est le point laissé ouvert par la revue :
--
--   « L'immuabilité des écritures générées, pas seulement celle des
--     règlements. Empêcher la modification directe du journal de
--     désynchroniser un paiement de son écriture. »
--
-- Sont figées les seules écritures produites par l'application, reconnaissables
-- à leur source_type (invoice, payment, order_payment, supply_alert,
-- cash_manual…). Les écritures saisies à la main — source_type nul — restent
-- modifiables : la comptabilité doit pouvoir corriger ses propres saisies.
--
-- Une écriture générée fautive se corrige par une contre-écriture, jamais par
-- réécriture de l'historique. C'est déjà la règle retenue pour les factures
-- validées et les règlements.
-- ============================================================================

create or replace function public.guard_generated_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_source text;
begin
  if tg_table_name = 'journal_entries' then
    v_source := coalesce(old.source_type, '');
    if v_source <> '' then
      raise exception
        'Écriture générée par % : elle ne peut être ni modifiée ni supprimée. Passez par une contre-écriture.',
        v_source;
    end if;
    return case tg_op when 'DELETE' then old else new end;
  end if;

  -- journal_lines : c'est l'écriture parente qui décide.
  select e.source_type into v_source
    from public.journal_entries e
   where e.id = coalesce(old.entry_id, new.entry_id);
  if coalesce(v_source, '') <> '' then
    raise exception
      'Ligne d''une écriture générée par % : correction interdite, passez par une contre-écriture.',
      v_source;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

revoke all on function public.guard_generated_journal() from public, anon, authenticated;

-- UPDATE et DELETE seulement : l'INSERT des lignes doit rester possible, c'est
-- ainsi que les fonctions de comptabilisation écrivent l'écriture qu'elles
-- viennent de créer. Une ligne ajoutée après coup déséquilibrerait l'écriture
-- et serait rejetée par check_journal_balance (migration 0002).
drop trigger if exists guard_generated_journal_entries on public.journal_entries;
create trigger guard_generated_journal_entries
  before update or delete on public.journal_entries
  for each row execute function public.guard_generated_journal();

drop trigger if exists guard_generated_journal_lines on public.journal_lines;
create trigger guard_generated_journal_lines
  before update or delete on public.journal_lines
  for each row execute function public.guard_generated_journal();
