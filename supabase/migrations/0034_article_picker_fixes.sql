-- ============================================================================
-- Caractère ERP — Saisie des articles : droits d'écriture couleurs / tailles
--
-- product_colors et product_sizes ont été créées avec RLS activée (migration
-- 0028) mais UNIQUEMENT une policy SELECT. Le bouton « + Ajouter nouvelle
-- couleur » du configurateur faisait donc un INSERT systématiquement rejeté,
-- sans message : le composant ignorait l'erreur et n'appliquait pas la valeur.
-- On aligne ces deux tables sur la convention du reste du schéma : lecture
-- pour tout utilisateur actif, écriture pour tout le monde sauf 'readonly'.
-- ============================================================================

drop policy if exists "product_colors_write" on public.product_colors;
create policy "product_colors_write" on public.product_colors for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');

drop policy if exists "product_sizes_write" on public.product_sizes;
create policy "product_sizes_write" on public.product_sizes for all to authenticated
  using (public.is_active_user() and public.current_role() <> 'readonly')
  with check (public.is_active_user() and public.current_role() <> 'readonly');
