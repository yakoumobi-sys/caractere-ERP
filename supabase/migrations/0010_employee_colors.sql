-- ============================================================================
-- Caractère ERP — couleur par employé, reprise par la commande qu'il détient
-- ============================================================================

alter table public.employees add column if not exists color text not null default '#475569';

-- Couleurs distinctes pour l'équipe déjà en place (best-effort par prénom)
update public.employees set color = '#ef4444' where first_name = 'Lilia' and color = '#475569';
update public.employees set color = '#f97316' where first_name = 'Lydia' and color = '#475569';
update public.employees set color = '#f59e0b' where first_name = 'Kholoud' and color = '#475569';
update public.employees set color = '#84cc16' where first_name = 'Abderahmane' and color = '#475569';
update public.employees set color = '#22c55e' where first_name = 'Hafid' and color = '#475569';
update public.employees set color = '#10b981' where first_name = 'Imene' and color = '#475569';
update public.employees set color = '#14b8a6' where first_name = 'Nesro' and color = '#475569';
update public.employees set color = '#06b6d4' where first_name = 'Manel' and color = '#475569';
update public.employees set color = '#0ea5e9' where first_name = 'Ikram' and color = '#475569';
update public.employees set color = '#3b82f6' where first_name = 'Hanane' and color = '#475569';
update public.employees set color = '#ec4899' where first_name = 'Aymen' and color = '#475569';

-- La vue de suivi de production expose désormais la couleur de l'employé assigné
drop view if exists public.pipeline_orders_view;

create view public.pipeline_orders_view as
select
  po.id,
  po.number,
  po.description,
  po.technique,
  po.status,
  po.logo_placement,
  po.logo_placement_note,
  po.logo_source,
  po.logo_source_value,
  po.contact_id,
  c.name as contact_name,
  c.phone as contact_phone,
  po.assigned_to,
  e.first_name as assignee_first_name,
  e.last_name as assignee_last_name,
  e.color as assignee_color,
  po.created_by,
  po.created_at,
  po.updated_at,
  (
    select max(l.created_at) from public.pipeline_stage_log l
    where l.pipeline_order_id = po.id and l.status = po.status
  ) as status_since
from public.pipeline_orders po
left join public.contacts c on c.id = po.contact_id
left join public.employees e on e.id = po.assigned_to;
