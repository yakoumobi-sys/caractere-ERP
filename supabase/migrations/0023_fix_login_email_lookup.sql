-- ============================================================================
-- Caractère ERP — Correctif : connexion impossible pour Mohamed Yakoubi
--
-- signIn() (lib/actions/auth-actions.ts) reconstruisait l'email de connexion
-- à partir du prénom ("prenom@caractere.com") au lieu de lire le vrai email
-- du compte. Ça fonctionnait par coïncidence pour les 11 employés créés via
-- 0016 (leur email de connexion EST prenom@caractere.com), mais pas pour
-- l'administrateur (Mohamed Yakoubi), dont le vrai compte est
-- yakoumobi@gmail.com : la connexion tentait de s'authentifier sur un email
-- qui n'existe pas, donc échouait avec n'importe quel mot de passe.
--
-- Cause racine côté données : profiles.email n'était renseigné que pour les
-- profils créés avant la migration 0013 (qui a ajouté la colonne) — le
-- trigger handle_new_user() ne le recopiait pas depuis auth.users.email à la
-- création. Corrigé ici + côté code, signIn() lit maintenant le vrai email
-- via employees -> profiles(email) au lieu de le deviner.
-- ============================================================================

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'readonly' end
  );
  return new;
end;
$$;
