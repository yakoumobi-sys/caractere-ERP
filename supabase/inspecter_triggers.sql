with details as (
  select 'TRIGGER ' || t.tgname || E'\n' || pg_get_triggerdef(t.oid) || E'\n' as bloc, 1 as ord, t.tgname as nom
  from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'pipeline_orders' and not t.tgisinternal
  union all
  select 'FONCTION ' || p.proname || E'\n' || pg_get_functiondef(p.oid) || E'\n', 2, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_journal_entries_for_order','mark_as_paid_on_confirmation',
                      'log_yalidine_status_change','log_pipeline_stage','set_pipeline_number',
                      'update_updated_at','set_updated_at')
)
select string_agg(bloc, E'\n-- ────────────────────────────────\n' order by ord, nom) as triggers_et_fonctions
from details;
