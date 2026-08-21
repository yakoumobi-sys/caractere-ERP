-- ============================================================================
-- Rapports, exports et données historiques pour prévisions
-- ============================================================================

-- Vue pour les statistiques de production (historique)
create or replace view public.production_stats as
select
  date_trunc('day', po.created_at)::date as day,
  po.technique,
  count(*) as order_count,
  count(po.assigned_to) filter (where po.assigned_to is not null) as assigned_count,
  avg(
    extract(epoch from (po.updated_at - po.created_at)) / 3600
  ) filter (where po.status = 'livree') as avg_hours_to_completion,
  count(*) filter (where po.status = 'livree') as completed_count
from public.pipeline_orders po
group by date_trunc('day', po.created_at), po.technique
order by day desc;

-- Vue pour les KPI quotidiens (CA, factures, etc.)
create or replace view public.daily_kpi as
select
  date_trunc('day', i.issue_date)::date as day,
  sum(i.total) as revenue,
  count(distinct i.id) as invoice_count,
  count(distinct case when i.status = 'validee' and i.amount_paid < i.total then i.id end) as unpaid_invoice_count,
  count(distinct po.id) as order_count
from public.invoices i
left join public.sales_orders so on i.sales_order_id = so.id
left join public.pipeline_orders po on so.contact_id = po.contact_id
  and po.created_at::date = i.issue_date::date
group by date_trunc('day', i.issue_date)
order by day desc;

-- Vue pour les performances employés (au-delà des 14j)
create or replace view public.employee_performance as
select
  e.id,
  e.first_name,
  e.last_name,
  e.department,
  e.color,
  count(distinct psl.id) as total_actions,
  count(distinct psl.pipeline_order_id) as orders_handled,
  count(distinct case when psl.status = 'livree' then psl.pipeline_order_id end) as orders_completed,
  count(distinct ef.id) as total_faults,
  count(distinct case when ef.severity = 'majeure' then ef.id end) as major_faults,
  count(distinct case when ef.severity = 'mineure' then ef.id end) as minor_faults,
  round(
    100.0 * count(distinct case when psl.status = 'livree' then psl.pipeline_order_id end)
    / nullif(count(distinct psl.pipeline_order_id), 0), 2
  ) as completion_rate
from public.employees e
left join public.pipeline_stage_log psl on e.id = (
  select assigned_to from public.pipeline_orders
  where id = psl.pipeline_order_id
)
left join public.employee_faults ef on e.id = ef.assigned_to
where e.status = 'actif'
group by e.id, e.first_name, e.last_name, e.department, e.color;

-- Configuration d'export (trace des rapports générés)
create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('invoice_pdf', 'quote_pdf', 'production_summary', 'sales_report', 'hr_report')),
  related_entity_id uuid,
  related_entity_type text,
  file_url text,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.generated_reports enable row level security;
create policy "Users can read reports they generated or admin can see all"
  on public.generated_reports for select
  using (
    generated_by = auth.uid()
    or exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create index if not exists idx_reports_type on public.generated_reports(report_type);
create index if not exists idx_reports_created on public.generated_reports(created_at);
