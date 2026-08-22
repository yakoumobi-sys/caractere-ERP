-- ============================================================================
-- Caractère ERP — correctif : création de compte échouait
-- ("Database error saving new user")
--
-- Le déclencheur handle_new_user() s'exécute dans le contexte interne du
-- serveur d'authentification (GoTrue), où auth.uid() n'est pas défini. Les
-- policies RLS de "profiles" (ex: is_active_user(), current_role()) évaluent
-- donc toujours à faux/null, ce qui peut bloquer l'insertion du profil malgré
-- le SECURITY DEFINER. On désactive explicitement le RLS pour cette insertion.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  set local row_security = off;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case
      when (select count(*) from public.profiles) = 0 then 'admin'::public.user_role
      else 'readonly'::public.user_role
    end
  );
  return new;
end;
$$;
