-- ============================================================================
-- Caractère ERP — Mot de passe changé à la première connexion + logo société
-- ============================================================================

alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Les 11 comptes employés créés avec le mot de passe par défaut 123456
-- (voir 0016) doivent le changer à leur première connexion.
update public.profiles p
set must_change_password = true
from public.employees e
where e.profile_id = p.id
  and e.first_name in ('Lilia','Lydia','Kholoud','Abderahmane','Hafid','Imene','Nesro','Manel','Ikram','Hanane','Aymen');

-- Bucket de stockage pour le logo de la société (companies.logo_url).
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

drop policy if exists "company_assets_public_read" on storage.objects;
create policy "company_assets_public_read" on storage.objects for select
  using (bucket_id = 'company-assets');

drop policy if exists "company_assets_authenticated_write" on storage.objects;
create policy "company_assets_authenticated_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets');

drop policy if exists "company_assets_authenticated_update" on storage.objects;
create policy "company_assets_authenticated_update" on storage.objects for update to authenticated
  using (bucket_id = 'company-assets');
