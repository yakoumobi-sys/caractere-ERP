-- ============================================================================
-- Caractère ERP — En cas d'absence déclarée, un collègue peut reprendre les
-- tâches en attente de la personne absente (les cocher terminées).
-- ============================================================================
drop policy if exists "employee_tasks_write_when_owner_absent" on public.employee_tasks;
create policy "employee_tasks_write_when_owner_absent" on public.employee_tasks for update
  to authenticated using (
    public.is_active_user() and public.current_role() <> 'readonly' and exists (
      select 1 from public.employee_absences ea
      where ea.employee_id = employee_tasks.employee_id and ea.absence_date = current_date
    )
  );
