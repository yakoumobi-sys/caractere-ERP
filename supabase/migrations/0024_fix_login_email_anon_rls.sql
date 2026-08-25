-- ============================================================================
-- Caractère ERP — Correctif urgent : la migration précédente (0023) cassait
-- la connexion pour TOUT LE MONDE, pas seulement l'admin.
--
-- signIn() interroge le vrai email de connexion AVANT authentification —
-- donc avec le rôle "anon" (aucune session). "employees" a une policy
-- publique (employees_public_select) pour alimenter le menu déroulant, mais
-- "profiles" n'a AUCUNE policy pour anon (seulement authenticated +
-- is_active_user()). Résultat : un embed employees->profiles(email) renvoie
-- toujours null pour anon, et signIn() rejetait tout le monde avec
-- "Utilisateur introuvable ou compte non configuré".
--
-- Fix : une fonction dédiée, minimale, SECURITY DEFINER, qui ne retourne QUE
-- l'email correspondant à un prénom — pas d'exposition de la table profiles
-- entière à anon (rôle/is_active restent invisibles avant connexion).
-- ============================================================================
create or replace function public.get_login_email(p_first_name text)
returns text
language sql security definer set search_path = public stable as $$
  select p.email
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.first_name ilike p_first_name
  limit 1;
$$;

grant execute on function public.get_login_email(text) to anon, authenticated;
