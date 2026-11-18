-- Les conversions utilisent current_date lorsque le document n'a pas de date saisie.
alter function public.convert_commercial_document(text, uuid) set timezone to 'Africa/Algiers';

-- Les lectures simultanées du tableau ne doivent pas dupliquer les alertes.
create or replace function public.sync_stale_order_alerts()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_active_user(), false) then raise exception 'Accès refusé'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sync_stale_order_alerts', 0));

  update public.supply_alerts a set status = 'resolue', resolved_at = now()
  from public.pipeline_orders o
  where a.pipeline_order_id = o.id and a.alert_type = 'retard_commande'
    and a.status <> 'resolue' and o.status in ('prete', 'livree');

  insert into public.supply_alerts(alert_type, department, title, description, priority, status, pipeline_order_id)
  select 'retard_commande', coalesce(o.technique, 'gros'), 'Commande ' || o.number || ' en retard',
         'Commande ouverte depuis plus de deux jours.', 'high', 'ouverte', o.id
  from public.pipeline_orders o
  where o.status not in ('prete', 'livree') and o.created_at < now() - interval '2 days'
    and not exists (
      select 1 from public.supply_alerts a where a.pipeline_order_id = o.id
        and a.alert_type = 'retard_commande' and a.status <> 'resolue'
    );
end $$;
revoke all on function public.sync_stale_order_alerts() from public, anon;
grant execute on function public.sync_stale_order_alerts() to authenticated;
