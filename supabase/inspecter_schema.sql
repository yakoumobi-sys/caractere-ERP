with inventaire as (
select 'RELATION|' || c.relkind::text || '|' || c.relname as ligne
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','m')
union all
select 'COLONNE|' || table_name || '|' || column_name || '|' || data_type
     || '|' || is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('pipeline_orders','contacts','products','supply_alerts','supply_types',
                     'order_payments','inventory_movements','purchase_orders','employee_faults','invoices')
union all
select 'TRIGGER|' || c.relname || '|' || t.tgname || '|' || p.proname
from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
union all
select 'FONCTION|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
     || '|' || case when p.prosecdef then 'definer' else 'invoker' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
union all
select 'POLICY_INSERT_INVALIDE|' || schemaname || '.' || tablename || '|' || policyname
from pg_policies
where schemaname = 'public' and cmd = 'INSERT' and qual is not null
union all
select 'CONTRAINTE|' || rel.relname || '|' || con.conname || '|' || pg_get_constraintdef(con.oid)
from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'c'
  and rel.relname in ('pipeline_orders','products','purchase_orders')
)
select string_agg(ligne, chr(10) order by ligne) as schema_reel from inventaire;
