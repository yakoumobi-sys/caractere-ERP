-- ============================================================================
-- Caractère ERP — détail des commandes de production
-- Articles (vêtement/couleur/taille/quantité), zones de personnalisation
-- (emplacement/taille/texte/technique) et fichiers (logo, mockup...)
-- ============================================================================

create table public.pipeline_order_items (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  product_name text not null,   -- ex: "T-shirt", "Polo", "Tote bag"
  color text,                   -- ex: "Noir", "Rouge"
  size text,                    -- ex: "S", "M", "L", "XL"
  quantity numeric(12,2) not null default 1,
  position int not null default 0
);
create index pipeline_order_items_order_idx on public.pipeline_order_items(pipeline_order_id);

create table public.pipeline_order_prints (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  placement text not null,      -- ex: "Coeur", "Dos", "Manche gauche"
  size_cm text,                 -- ex: "8cm", "30cm"
  text_content text,            -- ex: "eurl flex"
  technique text check (technique in ('dtf','broderie','flocage')),
  position int not null default 0
);
create index pipeline_order_prints_order_idx on public.pipeline_order_prints(pipeline_order_id);

create table public.pipeline_order_files (
  id uuid primary key default gen_random_uuid(),
  pipeline_order_id uuid not null references public.pipeline_orders(id) on delete cascade,
  file_url text not null,
  file_name text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pipeline_order_files_order_idx on public.pipeline_order_files(pipeline_order_id);

-- ----------------------------------------------------------------------------
-- RLS (même politique que le reste de l'ERP : lecture pour tout utilisateur
-- actif, écriture bloquée pour le rôle readonly)
-- ----------------------------------------------------------------------------
alter table public.pipeline_order_items enable row level security;
alter table public.pipeline_order_prints enable row level security;
alter table public.pipeline_order_files enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pipeline_order_items','pipeline_order_prints','pipeline_order_files']
  loop
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated using (public.is_active_user())',
      t
    );
    execute format(
      'create policy "%1$s_write" on public.%1$s for all to authenticated using (public.is_active_user() and public.current_role() <> ''readonly'') with check (public.is_active_user() and public.current_role() <> ''readonly'')',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Stockage des fichiers (logos, mockups) — bucket dédié
-- Bucket public en lecture (URLs non devinables car préfixées par l'UUID de
-- la commande) pour simplifier l'affichage ; écriture réservée aux utilisateurs
-- authentifiés actifs.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', true)
on conflict (id) do nothing;

create policy "order_files_public_read" on storage.objects for select
  using (bucket_id = 'order-files');

create policy "order_files_authenticated_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'order-files');

create policy "order_files_authenticated_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'order-files');
