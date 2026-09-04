-- ============================================================================
-- Caractère ERP — Correctif : des employés ne pouvaient plus créer de commande
--
-- Signalement du propriétaire : « la commande chez certains employés ne se
-- crée pas ». Vérification faite compte par compte (simulation d'insertion
-- sous l'identité de chaque employé, policies RLS comprises) : deux comptes
-- portaient profiles.is_active = false alors que leur fiche RH est bien
-- "actif" — Kholoud (Commercial) et Aymen (Atelier Flocage).
--
-- Or TOUTES les policies d'écriture de l'ERP commencent par is_active_user() :
-- pour ces deux comptes, la création de commande échouait avec
-- « new row violates row-level security policy for table pipeline_orders »,
-- et la lecture était vide partout (listes de clients, files d'atelier…).
-- Le seul endroit qui bascule ce drapeau est le badge "Actif / Désactivé" de
-- Paramètres > Utilisateurs, cliquable sans confirmation : une pression par
-- inadvertance suffisait à mettre un employé hors service, sans message
-- explicite de son côté.
--
-- Ce fichier réaligne le drapeau de connexion sur la fiche RH, et rend son
-- propre profil lisible même à un compte désactivé pour que l'application
-- puisse enfin afficher la vraie cause à l'employé ("votre compte est
-- désactivé") au lieu d'une erreur technique.
-- ============================================================================

-- 1) Un employé actif au RH doit pouvoir travailler dans l'ERP.
--    Volontairement limité aux profils rattachés à une fiche employé active :
--    les comptes de test (admin@test.com, test@test.com…) restent désactivés.
update public.profiles p
set is_active = true
from public.employees e
where e.profile_id = p.id
  and e.status = 'actif'
  and p.is_active = false;

-- 2) Chacun peut relire sa propre fiche profil, même désactivé.
--    Sans cela, un compte désactivé ne lit rien du tout — pas même son statut —
--    et l'application n'a aucun moyen de lui expliquer pourquoi plus rien ne
--    fonctionne. La lecture reste limitée à sa propre ligne.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (public.is_active_user() or id = auth.uid());
