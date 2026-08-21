-- ============================================================================
-- Caractère ERP — Row Level Security
-- Application interne mono-société : tout utilisateur authentifié peut lire ;
-- l'écriture est restreinte aux rôles pertinents.
-- ============================================================================

create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

-- Activation RLS sur toutes les tables métier
do $$
declare t text;
begin
  foreach t in array array[
    'companies','profiles','contacts','opportunities','activities',
    'product_categories','products','warehouses','stock_moves',
    'suppliers','purchase_orders','purchase_order_lines',
    'sales_quotes','sales_quote_lines','sales_orders','sales_order_lines',
    'invoices','invoice_lines','payments',
    'chart_of_accounts','journal_entries','journal_lines',
    'employees','projects'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Lecture : tout utilisateur authentifié et actif
do $$
declare t text;
begin
  foreach t in array array[
    'companies','profiles','contacts','opportunities','activities',
    'product_categories','products','warehouses','stock_moves',
    'suppliers','purchase_orders','purchase_order_lines',
    'sales_quotes','sales_quote_lines','sales_orders','sales_order_lines',
    'invoices','invoice_lines','payments',
    'chart_of_accounts','journal_entries','journal_lines',
    'employees','projects'
  ]
  loop
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated using (public.is_active_user())',
      t
    );
  end loop;
end $$;

-- Écriture standard : tout utilisateur actif sauf rôle "readonly"
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','opportunities','activities',
    'product_categories','products','warehouses','stock_moves',
    'suppliers','purchase_orders','purchase_order_lines',
    'sales_quotes','sales_quote_lines','sales_orders','sales_order_lines',
    'invoices','invoice_lines','payments',
    'employees','projects'
  ]
  loop
    execute format(
      'create policy "%1$s_write" on public.%1$s for all to authenticated using (public.is_active_user() and public.current_role() <> ''readonly'') with check (public.is_active_user() and public.current_role() <> ''readonly'')',
      t
    );
  end loop;
end $$;

-- Comptabilité : réservée à admin / accounting
create policy "chart_of_accounts_write" on public.chart_of_accounts for all to authenticated
  using (public.current_role() in ('admin','accounting'))
  with check (public.current_role() in ('admin','accounting'));

create policy "journal_entries_write" on public.journal_entries for all to authenticated
  using (public.current_role() in ('admin','accounting'))
  with check (public.current_role() in ('admin','accounting'));

create policy "journal_lines_write" on public.journal_lines for all to authenticated
  using (public.current_role() in ('admin','accounting'))
  with check (public.current_role() in ('admin','accounting'));

-- Société & profils : réservés à admin (les profils peuvent aussi être lus par tous via la policy select ci-dessus)
create policy "companies_write" on public.companies for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "profiles_write_self_or_admin" on public.profiles for update to authenticated
  using (auth.uid() = id or public.current_role() = 'admin')
  with check (auth.uid() = id or public.current_role() = 'admin');

create policy "profiles_admin_insert" on public.profiles for insert to authenticated
  with check (public.current_role() = 'admin');
