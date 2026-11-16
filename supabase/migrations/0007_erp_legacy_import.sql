-- Reprise non destructive des contacts de l'ancien ERP (public.contacts) vers erp.clients.
-- Les tables existantes ne sont ni modifiées ni supprimées ; un contact déjà repris (ou un téléphone déjà connu) est ignoré.
do $$
begin
  if to_regclass('public.contacts') is not null then
    execute $q$
      insert into erp.clients(kind, name, company, phone, phone_raw, email, commune, address, source, notes, legacy_contact_id, created_at)
      select distinct on (coalesce(erp.normalize_phone(c.phone), c.id::text))
             case when c.type::text = 'client' then 'client' else 'prospect' end, c.name, c.company_name, erp.normalize_phone(c.phone), c.phone,
             c.email, c.city, c.address, 'ancien_erp', c.notes, c.id, c.created_at
      from public.contacts c
      where c.type::text in ('client','prospect') and coalesce(btrim(c.name), '') <> ''
      order by coalesce(erp.normalize_phone(c.phone), c.id::text), c.created_at
      on conflict do nothing
    $q$;
  end if;
end $$;
